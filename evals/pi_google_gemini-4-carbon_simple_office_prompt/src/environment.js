import * as THREE from 'three';

export class OutdoorEnvironment {
  constructor(scene, textures) {
    this.scene = scene;
    this.textures = textures;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.swayTrees = [];
    this.lampEmissives = [];
    this.cars = [];
    this.fountainJets = [];
    this.outdoorSeats = [];
    this.cityMaterials = [];

    this._buildSkyAndLighting();
    this._buildGroundAndPlaza();
    this._buildFountain();
    this._buildOutdoorPatio();
    this._buildLandscapingAndLights();
    this._buildStreetAndTraffic();
    this._buildSurroundingSkyline();
  }

  _buildSkyAndLighting() {
    // Procedural Sky Shader Dome
    const skyGeo = new THREE.SphereGeometry(260, 40, 24);
    this.skyUniforms = {
      uTopColor: { value: new THREE.Color(0x1d4ed8) },
      uMidColor: { value: new THREE.Color(0x7dd3fc) },
      uHorizonColor: { value: new THREE.Color(0xe0f2fe) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.5).normalize() },
      uSunColor: { value: new THREE.Color(0xfff7ed) },
      uNightFactor: { value: 0.0 }
    };

    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this.skyUniforms,
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform vec3 uTopColor;
        uniform vec3 uMidColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uNightFactor;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
          vec3 dir = normalize(vWorldPos);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.28, h));
          col = mix(col, uTopColor, smoothstep(0.22, 0.85, h));

          // Solar glow & disc
          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          col += uSunColor * pow(sunDot, 24.0) * 0.35 * (1.0 - uNightFactor * 0.75);
          col += uSunColor * smoothstep(0.9985, 0.9996, sunDot) * (1.2 - uNightFactor);

          // Subtle night stars
          if (uNightFactor > 0.15 && dir.y > 0.08) {
            vec2 starUv = floor(dir.xz / (dir.y + 0.35) * 190.0);
            float s = hash(starUv);
            if (s > 0.994) {
              col += vec3(0.85, 0.92, 1.0) * uNightFactor * smoothstep(0.08, 0.35, dir.y);
            }
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    // Directional Sun / Moon Light
    this.sunLight = new THREE.DirectionalLight(0xfff6e5, 2.4);
    this.sunLight.position.set(38, 52, 42);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 165;
    const d = 42;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // Hemisphere + gentle architectural interior bounce
    this.hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x64748b, 0.85);
    this.scene.add(this.hemiLight);

    this.ambientLight = new THREE.AmbientLight(0xf8fafc, 0.35);
    this.scene.add(this.ambientLight);

    // Plaza evening warm fill
    this.plazaNightLight = new THREE.PointLight(0xffb76b, 0, 42, 1.5);
    this.plazaNightLight.position.set(0, 5.5, 19);
    this.scene.add(this.plazaNightLight);
  }

  _buildGroundAndPlaza() {
    // Broad urban park turf base
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x3f6a3e, roughness: 0.92 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), grassMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    this.group.add(ground);

    // Architectural stone plaza around building
    const plazaMat = new THREE.MeshStandardMaterial({
      map: this.textures.plazaStone,
      roughness: 0.72,
      metalness: 0.05
    });
    const plaza = new THREE.Mesh(new THREE.BoxGeometry(82, 0.12, 48), plazaMat);
    plaza.position.set(0, -0.05, 5.5);
    plaza.receiveShadow = true;
    this.group.add(plaza);

    // Entrance carpet-stone inlay walkway from street to lobby doors
    const walkMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.55 });
    const entryWalk = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.13, 17.5), walkMat);
    entryWalk.position.set(0, -0.04, 19.8);
    entryWalk.receiveShadow = true;
    this.group.add(entryWalk);
  }

  _buildFountain() {
    const basinGroup = new THREE.Group();
    basinGroup.position.set(-13.2, 0, 19.5);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5 });
    // Outer curbing
    const outer = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.55, 5.4), stoneMat);
    outer.position.y = 0.25;
    outer.castShadow = true;
    outer.receiveShadow = true;
    basinGroup.add(outer);

    const innerDark = new THREE.Mesh(
      new THREE.BoxGeometry(7.6, 0.58, 4.6),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3 })
    );
    innerDark.position.y = 0.26;
    basinGroup.add(innerDark);

    this.waterMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, 4.5, 16, 12),
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        roughness: 0.12,
        metalness: 0.35,
        transparent: true,
        opacity: 0.84
      })
    );
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y = 0.56;
    basinGroup.add(this.waterMesh);

    // 3 Frothy fountain jets + ripple rings
    const jetMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.78
    });

    [-2.1, 0, 2.1].forEach((jx, idx) => {
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.18, 1.35, 10), jetMat);
      jet.position.set(jx, 1.15, 0);
      basinGroup.add(jet);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.22, 0.34, 20),
        new THREE.MeshBasicMaterial({ color: 0xbae6fd, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(jx, 0.58, 0);
      basinGroup.add(ring);

      this.fountainJets.push({ jet, ring, phase: idx * 2.1 });
    });

    this.group.add(basinGroup);
  }

  _buildOutdoorPatio() {
    // East courtyard café tables with parasols where workers can eat lunch outdoors
    const umbrellaCols = [0xf8fafc, 0x0284c7, 0xf8fafc, 0x0f766e];
    const tableCoords = [
      { x: 11.5, z: 17.2 },
      { x: 16.2, z: 17.2 },
      { x: 11.5, z: 22.0 },
      { x: 16.2, z: 22.0 }
    ];

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6, roughness: 0.4 });
    const woodMat = new THREE.MeshStandardMaterial({ map: this.textures.woodOak, roughness: 0.6 });

    tableCoords.forEach((tc, idx) => {
      const tg = new THREE.Group();
      tg.position.set(tc.x, 0, tc.z);

      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.06, 20), woodMat);
      top.position.y = 0.74;
      top.castShadow = true;
      tg.add(top);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.55, 10), metalMat);
      pole.position.y = 1.28;
      pole.castShadow = true;
      tg.add(pole);

      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(1.75, 0.52, 8),
        new THREE.MeshStandardMaterial({ color: umbrellaCols[idx], roughness: 0.8, side: THREE.DoubleSide })
      );
      canopy.position.y = 2.52;
      canopy.castShadow = true;
      tg.add(canopy);

      // 3 chairs per patio table
      for (let c = 0; c < 3; c++) {
        const ang = (c / 3) * Math.PI * 2 + 0.4;
        const cx = Math.cos(ang) * 1.15;
        const cz = Math.sin(ang) * 1.15;
        const chair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.44), woodMat);
        chair.position.set(cx, 0.45, cz);
        chair.rotation.y = -ang + Math.PI / 2;
        tg.add(chair);

        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 6), metalMat);
        leg.position.set(cx, 0.22, cz);
        tg.add(leg);

        this.outdoorSeats.push({
          floor: 0,
          isOutdoor: true,
          x: tc.x + cx,
          z: tc.z + cz,
          faceX: tc.x,
          faceZ: tc.z,
          occupiedBy: null
        });
      }

      this.group.add(tg);
    });
  }

  _buildLandscapingAndLights() {
    const treePositions = [
      [-24, 16], [-24, 24], [-25, 3], [-25, -7],
      [24, 16], [24, 24], [25, 3], [25, -7],
      [-7.2, 24.5], [7.2, 24.5], [-18.5, 25.5], [20.5, 25.5]
    ];

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const planterMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 });
    const leafColors = [0x2d6a4f, 0x40916c, 0x52b788, 0x3a7d44];

    treePositions.forEach(([tx, tz], i) => {
      const wrap = new THREE.Group();
      wrap.position.set(tx, 0, tz);

      // Architectural planter box
      const planter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.48, 2.2), planterMat);
      planter.position.y = 0.24;
      planter.castShadow = true;
      planter.receiveShadow = true;
      wrap.add(planter);

      const soil = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.5, 1.9),
        new THREE.MeshStandardMaterial({ color: 0x3b2f2f, roughness: 1 })
      );
      soil.position.y = 0.26;
      wrap.add(soil);

      const foliagePivot = new THREE.Group();
      foliagePivot.position.y = 0.45;
      const scale = 0.88 + (i % 4) * 0.12;

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.22 * scale, 2.4 * scale, 8), trunkMat);
      trunk.position.y = 1.2 * scale;
      trunk.castShadow = true;
      foliagePivot.add(trunk);

      const leafMat = new THREE.MeshStandardMaterial({
        color: leafColors[i % leafColors.length],
        roughness: 0.82
      });

      const puffs = [
        [0, 2.8, 0, 1.35],
        [-0.65, 2.45, 0.4, 0.95],
        [0.65, 2.5, -0.35, 1.0],
        [0.15, 3.45, 0.2, 0.9]
      ];
      puffs.forEach(([px, py, pz, pr]) => {
        const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(pr * scale, 1), leafMat);
        crown.position.set(px * scale, py * scale, pz * scale);
        crown.castShadow = true;
        foliagePivot.add(crown);
      });

      wrap.add(foliagePivot);
      this.group.add(wrap);
      this.swayTrees.push({ pivot: foliagePivot, phase: i * 1.37 });
    });

    // Plaza benches
    const benchWood = new THREE.MeshStandardMaterial({ map: this.textures.woodOak, roughness: 0.65 });
    const benchCoords = [[-5.2, 17.5], [5.2, 17.5], [-13.2, 15.2]];
    benchCoords.forEach(([bx, bz]) => {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.65), benchWood);
      bench.position.set(bx, 0.25, bz);
      bench.castShadow = true;
      this.group.add(bench);
    });

    // Bollard lights along entry walkway + tall streetlamps along avenue
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.35 });
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.0
    });
    this.lampEmissives.push(bulbMat);

    [-3.8, 3.8].forEach(bx => {
      [14.2, 19.5, 24.8].forEach(bz => {
        const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.85, 10), postMat);
        bollard.position.set(bx, 0.42, bz);
        bollard.castShadow = true;
        this.group.add(bollard);

        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.18, 10), bulbMat);
        cap.position.set(bx, 0.9, bz);
        this.group.add(cap);
      });
    });

    // Avenue Streetlamps
    for (let sx = -36; sx <= 36; sx += 18) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 6.2, 8), postMat);
      pole.position.set(sx, 3.1, 28.4);
      pole.castShadow = true;
      this.group.add(pole);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.5), postMat);
      arm.position.set(sx, 6.15, 29.05);
      this.group.add(arm);

      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.55), bulbMat);
      lamp.position.set(sx, 6.08, 29.6);
      this.group.add(lamp);
    }
  }

  _buildStreetAndTraffic() {
    // Two-lane urban avenue in front of plaza (Z = 33.2)
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 9.2),
      new THREE.MeshStandardMaterial({ map: this.textures.roadAsphalt, roughness: 0.85 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.02, 33.4);
    road.receiveShadow = true;
    this.group.add(road);

    // Crosswalk stripes aligned with lobby entrance
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
    for (let z = 29.6; z <= 37.2; z += 1.1) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.52), stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(0, 0.035, z);
      this.group.add(stripe);
    }

    // Far sidewalk
    const farWalk = new THREE.Mesh(
      new THREE.BoxGeometry(240, 0.14, 4.5),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 })
    );
    farWalk.position.set(0, 0.05, 40.2);
    farWalk.receiveShadow = true;
    this.group.add(farWalk);

    // Animated Cars
    const carColors = [0xe2e8f0, 0x2563eb, 0xf59e0b, 0xef4444, 0x0f172a, 0x10b981];
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.7 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.15 });
    const headLightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfef08a, emissiveIntensity: 0.2 });
    const tailLightMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.4 });
    this.lampEmissives.push(headLightMat);

    for (let i = 0; i < 6; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const laneZ = dir === 1 ? 35.4 : 31.3;
      const car = new THREE.Group();

      const bodyMat = new THREE.MeshStandardMaterial({
        color: carColors[i % carColors.length],
        metalness: 0.45,
        roughness: 0.3
      });

      const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.72, 1.85), bodyMat);
      chassis.position.y = 0.58;
      chassis.castShadow = true;
      car.add(chassis);

      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.62, 1.62), glassMat);
      cabin.position.set(-0.15 * dir, 1.18, 0);
      cabin.castShadow = true;
      car.add(cabin);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 1.58), bodyMat);
      roof.position.set(-0.15 * dir, 1.5, 0);
      car.add(roof);

      // Headlights & Taillights
      [-0.62, 0.62].forEach(wz => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.32), headLightMat);
        hl.position.set(2.06 * dir, 0.62, wz);
        car.add(hl);

        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.34), tailLightMat);
        tl.position.set(-2.06 * dir, 0.64, wz);
        car.add(tl);
      });

      // 4 Wheels
      [[-1.25, -0.92], [1.25, -0.92], [-1.25, 0.92], [1.25, 0.92]].forEach(([wx, wz]) => {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12), wheelMat);
        w.rotation.x = Math.PI / 2;
        w.position.set(wx, 0.34, wz);
        car.add(w);
      });

      car.position.set(-90 + i * 34, 0.02, laneZ);
      this.group.add(car);
      this.cars.push({ mesh: car, dir, speed: 9.5 + (i % 3) * 2.2 });
    }
  }

  _buildSurroundingSkyline() {
    // Neighboring architectural context blocks so skyline views look rich and grounded
    const specs = [
      { x: -58, z: -28, w: 24, h: 36, d: 22 },
      { x: -24, z: -42, w: 28, h: 48, d: 20 },
      { x: 18, z: -45, w: 30, h: 42, d: 22 },
      { x: 58, z: -26, w: 24, h: 32, d: 24 },
      { x: -64, z: 12, w: 22, h: 28, d: 26 },
      { x: 64, z: 10, w: 22, h: 30, d: 24 },
      { x: -46, z: 64, w: 28, h: 26, d: 22 },
      { x: 46, z: 64, w: 28, h: 34, d: 22 }
    ];

    specs.forEach((b, idx) => {
      const mat = new THREE.MeshStandardMaterial({
        map: this.textures.cityFacadeDay,
        emissiveMap: this.textures.cityFacadeNight,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.05,
        roughness: 0.55,
        metalness: 0.25
      });
      this.cityMaterials.push(mat);

      const tower = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
      tower.position.set(b.x, b.h / 2 - 0.1, b.z);
      this.group.add(tower);

      // Crown mechanical penthouse
      const crown = new THREE.Mesh(
        new THREE.BoxGeometry(b.w * 0.6, 2.4, b.d * 0.6),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 })
      );
      crown.position.set(b.x, b.h + 1.1, b.z);
      this.group.add(crown);
    });
  }

  update(dt, simHour, elapsedReal) {
    // Solar arc from 05:30 sunrise to 19:30 sunset
    const dayAngle = ((simHour - 6.0) / 13.0) * Math.PI; // 0 at 6:00, PI/2 at 12:30, PI at 19:00
    const sunElev = Math.sin(dayAngle);
    const sunAzim = Math.cos(dayAngle);

    const sunVec = new THREE.Vector3(-sunAzim * 58, Math.max(sunElev * 64, 8), 36 + Math.sin(dayAngle * 0.7) * 16);
    this.sunLight.position.copy(sunVec);

    const nightFactor = THREE.MathUtils.clamp(1.0 - (sunElev + 0.18) / 0.45, 0, 1);
    const goldenFactor = THREE.MathUtils.clamp(1.0 - Math.abs(sunElev - 0.12) / 0.28, 0, 1) * (1.0 - nightFactor * 0.7);

    // Sky palette interpolation
    const dayTop = new THREE.Color(0x1d4ed8);
    const dayMid = new THREE.Color(0x60a5fa);
    const dayHor = new THREE.Color(0xdbeafe);

    const duskTop = new THREE.Color(0x312e81);
    const duskMid = new THREE.Color(0xc2410c);
    const duskHor = new THREE.Color(0xfdba74);

    const nightTop = new THREE.Color(0x020617);
    const nightMid = new THREE.Color(0x0f172a);
    const nightHor = new THREE.Color(0x1e293b);

    const topC = dayTop.clone().lerp(duskTop, goldenFactor).lerp(nightTop, nightFactor);
    const midC = dayMid.clone().lerp(duskMid, goldenFactor).lerp(nightMid, nightFactor);
    const horC = dayHor.clone().lerp(duskHor, goldenFactor).lerp(nightHor, nightFactor);

    this.skyUniforms.uTopColor.value.copy(topC);
    this.skyUniforms.uMidColor.value.copy(midC);
    this.skyUniforms.uHorizonColor.value.copy(horC);
    this.skyUniforms.uNightFactor.value = nightFactor;

    const shaderSunY = sunElev;
    this.skyUniforms.uSunDir.value.set(-sunAzim * 0.75, shaderSunY, 0.52).normalize();

    // Sun & ambient lighting intensity
    const sunColorDay = new THREE.Color(0xfffbeb);
    const sunColorGold = new THREE.Color(0xfb923c);
    const moonColor = new THREE.Color(0x93c5fd);

    this.sunLight.color.copy(sunColorDay).lerp(sunColorGold, goldenFactor).lerp(moonColor, nightFactor);
    this.sunLight.intensity = THREE.MathUtils.lerp(2.45, 0.28, nightFactor);
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.9, 0.32, nightFactor);
    this.ambientLight.intensity = THREE.MathUtils.lerp(0.38, 0.25, nightFactor);

    // Outdoor lamps, bollards, headlights & skyline windows
    const lampGlow = THREE.MathUtils.smoothstep(nightFactor + goldenFactor * 0.45, 0.25, 0.85);
    this.lampEmissives.forEach(m => { m.emissiveIntensity = 0.15 + lampGlow * 2.2; });
    this.cityMaterials.forEach(m => { m.emissiveIntensity = 0.04 + lampGlow * 0.85; });
    this.plazaNightLight.intensity = lampGlow * 2.2;

    // Gentle breeze tree sway
    this.swayTrees.forEach(t => {
      t.pivot.rotation.z = Math.sin(elapsedReal * 1.3 + t.phase) * 0.022;
      t.pivot.rotation.x = Math.cos(elapsedReal * 1.05 + t.phase) * 0.016;
    });

    // Fountain water animation
    this.fountainJets.forEach(fj => {
      const pulse = 0.88 + Math.sin(elapsedReal * 5.2 + fj.phase) * 0.14;
      fj.jet.scale.y = pulse;
      const rPhase = (elapsedReal * 0.9 + fj.phase * 0.3) % 1;
      const rScale = 0.6 + rPhase * 2.4;
      fj.ring.scale.set(rScale, rScale, 1);
      fj.ring.material.opacity = (1 - rPhase) * 0.55;
    });

    // Traffic movement
    const cappedDt = Math.min(dt, 0.08);
    this.cars.forEach(c => {
      c.mesh.position.x += c.dir * c.speed * cappedDt;
      if (c.dir === 1 && c.mesh.position.x > 115) c.mesh.position.x = -115;
      if (c.dir === -1 && c.mesh.position.x < -115) c.mesh.position.x = 115;
    });

    return { nightFactor, goldenFactor };
  }
}
