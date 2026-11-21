(function () {
  'use strict';

  var OfficeSim = (window.OfficeSim = window.OfficeSim || {});

  function CameraController(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.target = new THREE.Vector3(0, 11, -1);
    this.desiredTarget = this.target.clone();

    // Spherical coordinates around target
    this.spherical = new THREE.Spherical(42, 1.15, 0.65);
    this.desiredSpherical = this.spherical.clone();

    this.minRadius = 6;
    this.maxRadius = 95;
    this.minPhi = 0.14;
    this.maxPhi = Math.PI * 0.49;

    this.isDragging = false;
    this.dragMode = 'orbit'; // 'orbit' | 'pan'
    this.lastX = 0;
    this.lastY = 0;
    this.pointerMoved = false;

    this.autoOrbit = false;
    this.followTarget = null; // { getWorldPosition: fn } or THREE.Object3D
    this.keys = {};

    this._bindEvents();
    this.setPreset('cutaway', true);
  }

  CameraController.prototype._bindEvents = function () {
    var self = this;
    var el = this.domElement;

    el.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    el.addEventListener('pointerdown', function (e) {
      if (e.button === 2 || e.shiftKey) {
        self.dragMode = 'pan';
      } else {
        self.dragMode = 'orbit';
      }
      self.isDragging = true;
      self.pointerMoved = false;
      self.lastX = e.clientX;
      self.lastY = e.clientY;
    });

    window.addEventListener('pointermove', function (e) {
      if (!self.isDragging) return;
      var dx = e.clientX - self.lastX;
      var dy = e.clientY - self.lastY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        self.pointerMoved = true;
      }
      self.lastX = e.clientX;
      self.lastY = e.clientY;

      if (self.dragMode === 'orbit') {
        self.desiredSpherical.theta -= dx * 0.0065;
        self.desiredSpherical.phi = OfficeSim.Utils.clamp(
          self.desiredSpherical.phi - dy * 0.0055,
          self.minPhi,
          self.maxPhi
        );
      } else {
        // Pan in camera-local XZ / Y plane
        self.followTarget = null;
        var panSpeed = self.desiredSpherical.radius * 0.0014;
        var right = new THREE.Vector3();
        var up = new THREE.Vector3();
        self.camera.matrix.extractBasis(right, up, new THREE.Vector3());
        self.desiredTarget.addScaledVector(right, -dx * panSpeed);
        self.desiredTarget.addScaledVector(up, dy * panSpeed);
        self.desiredTarget.y = OfficeSim.Utils.clamp(self.desiredTarget.y, 0.5, 32);
      }
    });

    window.addEventListener('pointerup', function () {
      self.isDragging = false;
    });

    el.addEventListener('wheel', function (e) {
      e.preventDefault();
      var factor = e.deltaY > 0 ? 1.09 : 0.91;
      self.desiredSpherical.radius = OfficeSim.Utils.clamp(
        self.desiredSpherical.radius * factor,
        self.minRadius,
        self.maxRadius
      );
    }, { passive: false });

    window.addEventListener('keydown', function (e) {
      self.keys[e.code] = true;
    });
    window.addEventListener('keyup', function (e) {
      self.keys[e.code] = false;
    });
  };

  CameraController.prototype.setPreset = function (presetKey, immediate) {
    var preset = OfficeSim.CAMERA_PRESETS[presetKey];
    if (!preset) return;
    this.followTarget = null;
    this.flyTo(
      new THREE.Vector3(preset.pos[0], preset.pos[1], preset.pos[2]),
      new THREE.Vector3(preset.target[0], preset.target[1], preset.target[2]),
      immediate
    );
  };

  CameraController.prototype.focusFloor = function (floorIndex) {
    this.followTarget = null;
    var y = OfficeSim.Utils.floorToY(floorIndex) + 1.5;
    this.desiredTarget.set(0, y, 0);
    this.desiredSpherical.radius = 25;
    this.desiredSpherical.phi = 1.12;
  };

  CameraController.prototype.flyTo = function (pos, target, immediate) {
    this.desiredTarget.copy(target);
    var offset = pos.clone().sub(target);
    this.desiredSpherical.setFromVector3(offset);
    this.desiredSpherical.phi = OfficeSim.Utils.clamp(
      this.desiredSpherical.phi,
      this.minPhi,
      this.maxPhi
    );
    if (immediate) {
      this.target.copy(this.desiredTarget);
      this.spherical.copy(this.desiredSpherical);
      this._apply();
    }
  };

  CameraController.prototype.setFollow = function (obj, radius) {
    this.followTarget = obj || null;
    if (obj && radius) {
      this.desiredSpherical.radius = radius;
      this.desiredSpherical.phi = 1.15;
    }
  };

  CameraController.prototype.update = function (dt) {
    // Keyboard gentle panning
    var moveSpeed = 14 * dt;
    var forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    var right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    if (this.keys.KeyW || this.keys.ArrowUp) {
      this.followTarget = null;
      this.desiredTarget.addScaledVector(forward, moveSpeed);
    }
    if (this.keys.KeyS || this.keys.ArrowDown) {
      this.followTarget = null;
      this.desiredTarget.addScaledVector(forward, -moveSpeed);
    }
    if (this.keys.KeyD || this.keys.ArrowRight) {
      this.followTarget = null;
      this.desiredTarget.addScaledVector(right, moveSpeed);
    }
    if (this.keys.KeyA || this.keys.ArrowLeft) {
      this.followTarget = null;
      this.desiredTarget.addScaledVector(right, -moveSpeed);
    }

    if (this.autoOrbit && !this.isDragging) {
      this.desiredSpherical.theta += dt * 0.14;
    }

    if (this.followTarget) {
      var p = new THREE.Vector3();
      if (this.followTarget.getFollowPoint) {
        this.followTarget.getFollowPoint(p);
      } else if (this.followTarget.getWorldPosition) {
        this.followTarget.getWorldPosition(p);
        p.y += 1.2;
      }
      this.desiredTarget.copy(p);
    }

    var damp = 1 - Math.exp(-7.5 * dt);
    this.target.lerp(this.desiredTarget, damp);
    this.spherical.radius = OfficeSim.Utils.lerp(this.spherical.radius, this.desiredSpherical.radius, damp);
    this.spherical.phi = OfficeSim.Utils.lerp(this.spherical.phi, this.desiredSpherical.phi, damp);

    // Smooth angle wrap
    var dTheta = this.desiredSpherical.theta - this.spherical.theta;
    this.spherical.theta += dTheta * damp;

    this._apply();
  };

  CameraController.prototype._apply = function () {
    var offset = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  };

  OfficeSim.CameraController = CameraController;
})();
