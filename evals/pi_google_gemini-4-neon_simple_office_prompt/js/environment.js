(function () {
  'use strict';

  var OfficeSim = (window.OfficeSim = window.OfficeSim || {});

  function Environment(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.cars = [];
    this.clouds = [];
    this.streetLampLights = [];
    this.streetLampBulbs = [];
    this.fountainRings = [];
    this.stars = null;

    this._buildLights();
    this._buildGroundAndPlaza();
    this._buildFountain();
    this._buildLandscaping();
    this._buildStreetAndCars();
    this._buildCityContext();
    this._buildSkyDetails();
  }

  Environment.prototype._buildLights = function () {
    this.hemiLight = new THREE.HemisphereLight(0xcfe8ff, 0x475569, 0.72);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff7e6, 1.35);
    this.sunLight.position.set(28, 42, 30);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 130;
    var d = 38;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // Subtle cool rim/fill light from opposite side
    this.fillLight = new THREE.DirectionalLight(0x93c5fd, 0.32);
    this.fillLight.position.set(-28, 18, -22);
    this.scene.add(this.fillLight);
  };

  Environment.prototype._buildGroundAndPlaza = function () {
    // Broad urban ground plane
    var groundGeo = new THREE.PlaneGeometry(240, 240);
    var groundMat = new THREE.MeshStandardMaterial({
      color: 0x3f4c3f,
      roughness: 0.95,
      metalness: 0.0
    });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.18;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Granite plaza podium around the tower
    var plazaMat = new THREE.MeshStandardMaterial({
      map: OfficeSim.Textures.get('plaza'),
      roughness: 0.82,
      metalness: 0.05
    });
    var plaza = new THREE.Mesh(new THREE.BoxGeometry(58, 0.22, 42), plazaMat);
    plaza.position.set(0, -0.12, 3);
    plaza.receiveShadow = true;
    this.group.add(plaza);

    // Front walkway carpet pavers leading to entrance
    var walkMat = new THREE.MeshStandardMaterial({
      color: 0xd6d3cd,
      roughness: 0.72,
      metalness: 0.08
    });
    var walkway = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.04, 15.5), walkMat);
    walkway.position.set(0, 0.0, 16.5);
    walkway.receiveShadow = true;
    this.group.add(walkway);

    // Park lawns flanking the plaza
    var lawnMat = new THREE.MeshStandardMaterial({ color: 0x4f7d47, roughness: 0.92 });
    var lawnLeft = new THREE.Mesh(new THREE.BoxGeometry(16, 0.16, 26), lawnMat);
    lawnLeft.position.set(-22, -0.05, 5);
    lawnLeft.receiveShadow = true;
    this.group.add(lawnLeft);

    var lawnRight = new THREE.Mesh(new THREE.BoxGeometry(16, 0.16, 26), lawnMat);
    lawnRight.position.set(22, -0.05, 5);
    lawnRight.receiveShadow = true;
    this.group.add(lawnRight);
  };

  Environment.prototype._buildFountain = function () {
    var fx = -9.5, fz = 16.5;
    var basinMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.45, metalness: 0.15 });
    var outerRim = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.2, 0.55, 28), basinMat);
    outerRim.position.set(fx, 0.27, fz);
    outerRim.castShadow = true;
    outerRim.receiveShadow = true;
    this.group.add(outerRim);

    var waterMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.12,
      metalness: 0.35,
      transparent: true,
      opacity: 0.85
    });
    var water = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.42, 28), waterMat);
    water.position.set(fx, 0.32, fz);
    this.group.add(water);

    var spire = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 1.35, 12), basinMat);
    spire.position.set(fx, 0.72, fz);
    spire.castShadow = true;
    this.group.add(spire);

    // Animated water jet & ripples
    var jetMat = new THREE.MeshBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.7 });
    this.fountainJet = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.1, 12, 1, true), jetMat);
    this.fountainJet.position.set(fx, 1.55, fz);
    this.fountainJet.rotation.x = Math.PI;
    this.group.add(this.fountainJet);

    for (var i = 0; i < 3; i++) {
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.5, 24),
        new THREE.MeshBasicMaterial({ color: 0xe0f2fe, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(fx, 0.55, fz);
      ring.userData.phase = i * 0.33;
      this.group.add(ring);
      this.fountainRings.push(ring);
    }
  };

  Environment.prototype._createTree = function (x, z, scale) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    var s = scale || 1;

    var trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4c35, roughness: 0.9 });
    var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.26 * s, 2.2 * s, 8), trunkMat);
    trunk.position.y = 1.1 * s;
    trunk.castShadow = true;
    g.add(trunk);

    var greens = [0x3b7a3e, 0x4b8f48, 0x2f6b36];
    var offsets = [
      [0, 3.0, 0, 1.45],
      [-0.65, 2.55, 0.4, 1.05],
      [0.65, 2.65, -0.35, 1.1],
      [0.1, 3.65, 0.2, 0.95]
    ];
    for (var i = 0; i < offsets.length; i++) {
      var o = offsets[i];
      var leafMat = new THREE.MeshStandardMaterial({
        color: greens[i % greens.length],
        roughness: 0.85
      });
      var crown = new THREE.Mesh(new THREE.DodecahedronGeometry(o[3] * s, 1), leafMat);
      crown.position.set(o[0] * s, o[1] * s, o[2] * s);
      crown.castShadow = true;
      crown.receiveShadow = true;
      g.add(crown);
    }
    this.group.add(g);
  };

  Environment.prototype._createBench = function (x, z, rotY) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY || 0;
    var woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.75 });
    var metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.35 });

    var seat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 0.55), woodMat);
    seat.position.y = 0.48;
    seat.castShadow = true;
    g.add(seat);

    var back = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.38, 0.08), woodMat);
    back.position.set(0, 0.74, -0.24);
    back.rotation.x = -0.15;
    back.castShadow = true;
    g.add(back);

    for (var i = -1; i <= 1; i += 2) {
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.48, 0.5), metalMat);
      leg.position.set(i * 0.78, 0.24, 0);
      g.add(leg);
    }
    this.group.add(g);
  };

  Environment.prototype._createStreetLamp = function (x, z) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    var poleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.3 });
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 5.2, 8), poleMat);
    pole.position.y = 2.6;
    pole.castShadow = true;
    g.add(pole);

    var arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.0), poleMat);
    arm.position.set(0, 5.15, 0.4);
    g.add(arm);

    var bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.1
    });
    var bulb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.55), bulbMat);
    bulb.position.set(0, 5.08, 0.75);
    g.add(bulb);
    this.streetLampBulbs.push(bulbMat);

    this.group.add(g);
  };

  Environment.prototype._buildLandscaping = function () {
    // Trees framing the plaza & park
    var treePositions = [
      [-19, 14, 1.15], [-23, 6, 1.0], [-20, -4, 1.2], [-18, -12, 0.95],
      [19, 14, 1.1], [23, 5, 1.25], [20, -5, 1.0], [18, -12, 1.05],
      [10.5, 17.5, 0.95], [14.5, 16.0, 0.85], [-15.5, 19.0, 0.9]
    ];
    for (var i = 0; i < treePositions.length; i++) {
      var t = treePositions[i];
      this._createTree(t[0], t[1], t[2]);
    }

    // Plaza benches
    this._createBench(7.5, 15.0, -0.4);
    this._createBench(11.5, 14.5, -0.6);
    this._createBench(-5.5, 19.5, 0.3);

    // Low decorative hedges flanking entrance walkway
    var hedgeMat = new THREE.MeshStandardMaterial({ color: 0x2f6b35, roughness: 0.9 });
    var h1 = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.65, 1.0), hedgeMat);
    h1.position.set(-6.5, 0.32, 11.2);
    h1.castShadow = true;
    this.group.add(h1);

    var h2 = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.65, 1.0), hedgeMat);
    h2.position.set(6.5, 0.32, 11.2);
    h2.castShadow = true;
    this.group.add(h2);

    // Streetlamps along sidewalk
    var lampXs = [-22, -10, 10, 22];
    for (var j = 0; j < lampXs.length; j++) {
      this._createStreetLamp(lampXs[j], 22.8);
    }

    // Warm plaza point light that fades in at dusk/night
    this.plazaNightLight = new THREE.PointLight(0xffcf87, 0, 35, 1.5);
    this.plazaNightLight.position.set(0, 7, 17);
    this.scene.add(this.plazaNightLight);
  };

  Environment.prototype._buildStreetAndCars = function () {
    // Asphalt avenue in front of the plaza
    var roadMat = new THREE.MeshStandardMaterial({
      map: OfficeSim.Textures.get('road'),
      roughness: 0.88,
      metalness: 0.05
    });
    var road = new THREE.Mesh(new THREE.PlaneGeometry(180, 11), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.05, 29.5);
    road.receiveShadow = true;
    this.group.add(road);

    // Sidewalk curb
    var curbMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.8 });
    var curb = new THREE.Mesh(new THREE.BoxGeometry(180, 0.14, 0.4), curbMat);
    curb.position.set(0, 0.02, 23.9);
    this.group.add(curb);

    // Crosswalk stripes in front of main entrance
    var stripeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.7 });
    for (var s = -2; s <= 2; s++) {
      var stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 8.8), stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(s * 1.4, -0.03, 29.5);
      this.group.add(stripe);
    }

    // Animated traffic cars
    var carColors = [0xdc2626, 0x2563eb, 0xf8fafc, 0x334155, 0x059669, 0xd97706, 0x7c3aed];
    for (var c = 0; c < 7; c++) {
      var dir = c % 2 === 0 ? 1 : -1;
      var car = this._createCar(carColors[c % carColors.length], dir);
      car.mesh.position.set(-70 + c * 22, 0.0, dir === 1 ? 32.0 : 27.0);
      this.group.add(car.mesh);
      this.cars.push(car);
    }
  };

  Environment.prototype._createCar = function (color, dir) {
    var g = new THREE.Group();
    var bodyMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 0.45 });
    var cabinMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.6 });
    var wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });

    var body = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.75, 1.85), bodyMat);
    body.position.y = 0.62;
    body.castShadow = true;
    g.add(body);

    var cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.62, 1.62), cabinMat);
    cabin.position.set(-0.2, 1.24, 0);
    cabin.castShadow = true;
    g.add(cabin);

    var wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.25, 10);
    wheelGeo.rotateX(Math.PI / 2);
    var wCoords = [[-1.25, 0.92], [1.25, 0.92], [-1.25, -0.92], [1.25, -0.92]];
    for (var i = 0; i < wCoords.length; i++) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(wCoords[i][0], 0.34, wCoords[i][1]);
      g.add(w);
    }

    var headMat = new THREE.MeshStandardMaterial({ color: 0xfef9c3, emissive: 0xfef08a, emissiveIntensity: 0.2 });
    var tailMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.4 });
    for (var s = -1; s <= 1; s += 2) {
      var hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.32), headMat);
      hl.position.set(2.01, 0.65, s * 0.62);
      g.add(hl);
      var tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 0.32), tailMat);
      tl.position.set(-2.01, 0.65, s * 0.62);
      g.add(tl);
    }

    if (dir === -1) {
      g.rotation.y = Math.PI;
    }

    return {
      mesh: g,
      dir: dir,
      speed: OfficeSim.Utils.rand(7.5, 12.5),
      headMat: headMat,
      tailMat: tailMat
    };
  };

  Environment.prototype._buildCityContext = function () {
    // Distant surrounding urban buildings to frame the horizon
    var facadeTex = OfficeSim.Textures.get('cityFacade');
    var specs = [
      [-52, -26, 18, 34, 16, 0x475569],
      [-46, 2, 14, 24, 14, 0x64748b],
      [-56, -6, 16, 44, 18, 0x334155],
      [52, -22, 18, 38, 18, 0x475569],
      [48, 6, 15, 22, 15, 0x64748b],
      [58, -2, 16, 46, 16, 0x334155],
      [-20, -48, 22, 32, 16, 0x3f4e63],
      [14, -50, 24, 42, 18, 0x334155],
      [42, -48, 20, 28, 16, 0x4b5c72],
      [-44, -46, 18, 26, 16, 0x526278]
    ];
    for (var i = 0; i < specs.length; i++) {
      var b = specs[i];
      var mat = new THREE.MeshStandardMaterial({
        color: b[5],
        map: facadeTex,
        roughness: 0.65,
        metalness: 0.2
      });
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(b[2], b[3], b[4]), mat);
      mesh.position.set(b[0], b[3] / 2 - 0.15, b[1]);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  };

  Environment.prototype._buildSkyDetails = function () {
    // Soft puffy clouds
    var cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      transparent: true,
      opacity: 0.82
    });
    for (var i = 0; i < 8; i++) {
      var cg = new THREE.Group();
      for (var p = 0; p < 3; p++) {
        var puff = new THREE.Mesh(new THREE.DodecahedronGeometry(3.2 + p * 0.7, 1), cloudMat);
        puff.position.set((p - 1) * 3.0, (p % 2) * 0.8, (p - 1) * 0.6);
        puff.scale.set(1.4, 0.55, 0.9);
        cg.add(puff);
      }
      cg.position.set(-70 + i * 22, 42 + (i % 3) * 5, -35 + (i % 4) * 14);
      this.group.add(cg);
      this.clouds.push({ mesh: cg, speed: 0.5 + (i % 3) * 0.25 });
    }

    // Starfield for dusk/night
    var starGeo = new THREE.BufferGeometry();
    var starCount = 260;
    var positions = new Float32Array(starCount * 3);
    for (var s = 0; s < starCount; s++) {
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.random() * Math.PI * 0.42;
      var r = 135;
      positions[s * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[s * 3 + 1] = r * Math.cos(phi) + 10;
      positions[s * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var starMat = new THREE.PointsMaterial({ color: 0xe2e8f0, size: 0.9, transparent: true, opacity: 0 });
    this.stars = new THREE.Points(starGeo, starMat);
    this.scene.add(this.stars);
  };

  Environment.prototype.setShadowsEnabled = function (enabled) {
    this.sunLight.castShadow = enabled;
  };

  Environment.prototype.update = function (dt, simHour, realElapsed) {
    // Animate traffic cars
    for (var i = 0; i < this.cars.length; i++) {
      var car = this.cars[i];
      car.mesh.position.x += car.dir * car.speed * dt;
      if (car.mesh.position.x > 85) car.mesh.position.x = -85;
      if (car.mesh.position.x < -85) car.mesh.position.x = 85;
    }

    // Drift clouds
    for (var c = 0; c < this.clouds.length; c++) {
      var cl = this.clouds[c];
      cl.mesh.position.x += cl.speed * dt;
      if (cl.mesh.position.x > 95) cl.mesh.position.x = -95;
    }

    // Fountain ripples
    if (this.fountainJet) {
      this.fountainJet.scale.y = 0.9 + Math.sin(realElapsed * 9) * 0.12;
    }
    for (var r = 0; r < this.fountainRings.length; r++) {
      var ring = this.fountainRings[r];
      var p = (realElapsed * 0.65 + ring.userData.phase) % 1;
      var sc = 0.6 + p * 4.2;
      ring.scale.set(sc, sc, 1);
      ring.material.opacity = (1 - p) * 0.55;
    }

    // Dynamic Day-Night Sky & Sun Cycle
    this._updateDayNight(simHour);
  };

  Environment.prototype._updateDayNight = function (hour) {
    // Sun arc from 6:00 (sunrise) to 19:30 (sunset)
    var dayT = OfficeSim.Utils.clamp((hour - 6.0) / 13.5, 0, 1);
    var sunAngle = dayT * Math.PI; // 0 at sunrise, PI/2 at noon, PI at sunset
    var sunElev = Math.sin(sunAngle); // 0..1
    var isNight = hour < 5.75 || hour > 19.75;

    var sunX = -Math.cos(sunAngle) * 52;
    var sunY = Math.max(6, sunElev * 54);
    var sunZ = 24 + Math.sin(sunAngle) * 14;
    this.sunLight.position.set(sunX, sunY, sunZ);

    // Sky color interpolation
    var skyDay = new THREE.Color(0x87c5f5);
    var skyGolden = new THREE.Color(0xf59e6c);
    var skyDusk = new THREE.Color(0x1e2948);
    var skyNight = new THREE.Color(0x0b1120);

    var skyColor = new THREE.Color();
    var sunColor = new THREE.Color(0xfff6e5);
    var sunIntensity = 1.35;
    var hemiIntensity = 0.72;
    var nightFactor = 0; // 0 = day, 1 = night

    if (hour >= 8.5 && hour <= 16.0) {
      skyColor.copy(skyDay);
      sunIntensity = 1.35;
      hemiIntensity = 0.75;
      nightFactor = 0;
    } else if (hour > 16.0 && hour <= 18.2) {
      var t1 = (hour - 16.0) / 2.2;
      skyColor.copy(skyDay).lerp(skyGolden, t1);
      sunColor.setHex(0xffc98b);
      sunIntensity = OfficeSim.Utils.lerp(1.35, 0.9, t1);
      hemiIntensity = OfficeSim.Utils.lerp(0.75, 0.52, t1);
      nightFactor = t1 * 0.35;
    } else if (hour > 18.2 && hour <= 20.0) {
      var t2 = (hour - 18.2) / 1.8;
      skyColor.copy(skyGolden).lerp(skyNight, t2);
      sunColor.setHex(0xff8c5a);
      sunIntensity = OfficeSim.Utils.lerp(0.9, 0.12, t2);
      hemiIntensity = OfficeSim.Utils.lerp(0.52, 0.24, t2);
      nightFactor = OfficeSim.Utils.lerp(0.35, 1.0, t2);
    } else if (hour >= 5.5 && hour < 8.5) {
      var t3 = (hour - 5.5) / 3.0;
      if (t3 < 0.45) {
        skyColor.copy(skyDusk).lerp(skyGolden, t3 / 0.45);
      } else {
        skyColor.copy(skyGolden).lerp(skyDay, (t3 - 0.45) / 0.55);
      }
      sunColor.setHex(0xffdfa8);
      sunIntensity = OfficeSim.Utils.lerp(0.25, 1.35, t3);
      hemiIntensity = OfficeSim.Utils.lerp(0.3, 0.75, t3);
      nightFactor = 1 - t3;
    } else {
      skyColor.copy(skyNight);
      sunColor.setHex(0x64748b);
      sunIntensity = 0.14;
      hemiIntensity = 0.22;
      nightFactor = 1.0;
    }

    this.scene.background = skyColor;
    if (this.scene.fog) {
      this.scene.fog.color.copy(skyColor);
    }
    this.sunLight.color.copy(sunColor);
    this.sunLight.intensity = sunIntensity;
    this.hemiLight.intensity = hemiIntensity;

    if (this.stars) {
      this.stars.material.opacity = OfficeSim.Utils.clamp((nightFactor - 0.4) * 1.6, 0, 0.9);
    }

    // Streetlamps & car headlights brighten at dusk/night
    for (var l = 0; l < this.streetLampBulbs.length; l++) {
      this.streetLampBulbs[l].emissiveIntensity = 0.15 + nightFactor * 2.2;
    }
    this.plazaNightLight.intensity = nightFactor * 1.6;
    for (var c = 0; c < this.cars.length; c++) {
      this.cars[c].headMat.emissiveIntensity = 0.25 + nightFactor * 2.5;
      this.cars[c].tailMat.emissiveIntensity = 0.4 + nightFactor * 1.8;
    }

    this.nightFactor = nightFactor;
    this.isNight = isNight;
  };

  OfficeSim.Environment = Environment;
})();
