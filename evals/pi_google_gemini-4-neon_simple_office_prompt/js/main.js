(function () {
  'use strict';

  var OfficeSim = (window.OfficeSim = window.OfficeSim || {});

  function showError(msg) {
    var overlay = document.getElementById('error-overlay');
    var msgEl = document.getElementById('error-message');
    if (msgEl) msgEl.textContent = msg;
    if (overlay) overlay.classList.remove('hidden');
  }

  function bootstrap() {
    if (typeof THREE === 'undefined') {
      showError('Three.js could not be loaded. Please ensure internet access to load Three.js r128 or serve a local copy.');
      return;
    }

    var container = document.getElementById('canvas-container');
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (err) {
      showError('WebGL initialization failed: ' + err.message);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87c5f5);
    scene.fog = new THREE.FogExp2(0x87c5f5, 0.0052);

    var camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.4, 280);

    // Initialize procedural textures & world subsystems
    OfficeSim.Textures.init();
    var cameraCtrl = new OfficeSim.CameraController(camera, renderer.domElement);
    var environment = new OfficeSim.Environment(scene);
    var building = new OfficeSim.Building(scene);
    var sim = new OfficeSim.Simulation(scene, building, environment);
    var ui = new OfficeSim.UIController(sim, cameraCtrl, building, environment);

    // Expose handle for debugging / inspection
    OfficeSim.app = {
      renderer: renderer,
      scene: scene,
      camera: camera,
      cameraCtrl: cameraCtrl,
      environment: environment,
      building: building,
      sim: sim,
      ui: ui
    };

    // Raycasting for clicking workers & elevator cabs
    var raycaster = new THREE.Raycaster();
    var mouseNdc = new THREE.Vector2();

    renderer.domElement.addEventListener('pointerup', function (e) {
      if (e.button !== 0 || cameraCtrl.pointerMoved) return;
      var rect = renderer.domElement.getBoundingClientRect();
      mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseNdc, camera);

      // Collect selectable targets (workers first, then elevator cabs)
      var targets = [];
      for (var i = 0; i < sim.workers.length; i++) {
        if (sim.workers[i].group.visible) targets.push(sim.workers[i].group);
      }
      for (var c = 0; c < sim.elevators.cars.length; c++) {
        targets.push(sim.elevators.cars[c].group);
      }

      var hits = raycaster.intersectObjects(targets, true);
      if (hits.length > 0) {
        var obj = hits[0].object;
        if (obj.userData && obj.userData.worker) {
          ui.selectWorker(obj.userData.worker);
          return;
        }
        if (obj.userData && obj.userData.elevator) {
          ui.selectElevator(obj.userData.elevator);
          return;
        }
      }
    });

    // Responsive resize
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Main animation loop
    var lastTime = performance.now();
    function animate(now) {
      requestAnimationFrame(animate);
      var dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      sim.update(dt);

      // Respect Isolate Floor mode for worker visibility
      var isolateMode = building.viewMode === 'isolate' && building.isolatedFloor !== null;
      for (var i = 0; i < sim.workers.length; i++) {
        var w = sim.workers[i];
        if (w.state === 'OUTSIDE_AWAY') {
          w.group.visible = false;
        } else if (isolateMode) {
          w.group.visible = (w.floor <= building.isolatedFloor);
        } else {
          w.group.visible = true;
        }
      }

      cameraCtrl.update(dt);
      ui.update(dt, camera);
      renderer.render(scene, camera);
    }

    requestAnimationFrame(animate);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
