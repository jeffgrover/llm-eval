import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createTextures } from './textures.js';
import { OutdoorEnvironment } from './environment.js';
import { OfficeBuilding } from './building.js';
import { ElevatorSystem } from './elevator.js';
import { BuildingNavigator } from './navigation.js';
import { OfficeSimulation } from './simulation.js';
import { UIController, CAMERA_PRESETS } from './ui.js';

class OfficeApp {
  constructor() {
    this.canvasContainer = document.getElementById('viewport');
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xcbd5e1, 0.0028);

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.25,
      520
    );
    this.camera.position.set(...CAMERA_PRESETS.overview.pos);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.canvasContainer.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.492; // prevent going underground
    this.controls.minDistance = 4.0;
    this.controls.maxDistance = 135.0;
    this.controls.target.set(...CAMERA_PRESETS.overview.target);

    // Camera tween & follow state
    this.camAnim = null;
    this.followWorker = null;

    // Build World, Architecture, Elevators, Navigation & Simulation
    const textures = createTextures();
    this.outdoor = new OutdoorEnvironment(this.scene, textures);
    this.building = new OfficeBuilding(this.scene, textures);
    this.elevators = new ElevatorSystem(this.scene, this.building);
    this.navigator = new BuildingNavigator();
    this.simulation = new OfficeSimulation(
      this.scene,
      this.building,
      this.elevators,
      this.outdoor,
      this.navigator
    );

    this.ui = new UIController(this.simulation, this.building, this.elevators, {
      flyTo: (pos, target) => this.flyCameraTo(pos, target),
      setFollowWorker: w => { this.followWorker = w; }
    });

    this._setupInteraction();
    this._hideLoader();

    this.clock = new THREE.Clock();
    this.elapsedReal = 0;
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  flyCameraTo(posArr, targetArr) {
    this.camAnim = {
      startPos: this.camera.position.clone(),
      endPos: new THREE.Vector3(...posArr),
      startTarget: this.controls.target.clone(),
      endTarget: new THREE.Vector3(...targetArr),
      progress: 0,
      duration: 1.05
    };
  }

  _setupInteraction() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Raycast click-to-inspect inhabitants
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    this.renderer.domElement.addEventListener('pointerdown', e => {
      downX = e.clientX;
      downY = e.clientY;
      // Cancel scripted fly-to if user grabs orbit controls
      if (this.camAnim) this.camAnim = null;
    });

    this.renderer.domElement.addEventListener('pointerup', e => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;

      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(pointer, this.camera);

      const hitboxes = this.simulation.workers
        .filter(w => w.mesh.visible)
        .map(w => w.hitbox);

      const hits = raycaster.intersectObjects(hitboxes, false);
      if (hits.length > 0 && hits[0].object.userData.worker) {
        this.ui.selectWorker(hits[0].object.userData.worker);
      }
    });
  }

  _hideLoader() {
    const loader = document.getElementById('loading-overlay');
    if (loader) {
      requestAnimationFrame(() => {
        loader.classList.add('fade-out');
        setTimeout(() => loader.remove(), 550);
      });
    }
  }

  _updateCamera(dt) {
    if (this.camAnim) {
      this.camAnim.progress = Math.min(1, this.camAnim.progress + dt / this.camAnim.duration);
      // Cubic ease-out
      const t = 1 - Math.pow(1 - this.camAnim.progress, 3);
      this.camera.position.lerpVectors(this.camAnim.startPos, this.camAnim.endPos, t);
      this.controls.target.lerpVectors(this.camAnim.startTarget, this.camAnim.endTarget, t);
      if (this.camAnim.progress >= 1) {
        this.camAnim = null;
      }
    } else if (this.followWorker && this.followWorker.state !== 'OFFSITE') {
      const w = this.followWorker;
      const desiredTarget = new THREE.Vector3(w.x, w.y + 1.3, w.z);
      const offset = this.camera.position.clone().sub(this.controls.target);
      // Keep comfortable follow distance
      const clampedLen = THREE.MathUtils.clamp(offset.length(), 6.5, 16.0);
      offset.setLength(clampedLen);

      this.controls.target.lerp(desiredTarget, Math.min(1, dt * 6.5));
      this.camera.position.copy(this.controls.target).add(offset);
    }

    // Update atmospheric fog tint subtly with sky horizon color
    this.scene.fog.color.copy(this.outdoor.skyUniforms.uHorizonColor.value);
    this.controls.update();
  }

  _animate() {
    requestAnimationFrame(this._animate);
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.08);
    this.elapsedReal += dt;

    this.simulation.update(dt, this.elapsedReal);
    this._updateCamera(dt);
    this.ui.update();

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__officeApp = new OfficeApp();
});
