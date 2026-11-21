(function () {
  'use strict';

  var OfficeSim = (window.OfficeSim = window.OfficeSim || {});
  var U = OfficeSim.Utils;

  function UIController(sim, cameraCtrl, building, environment) {
    this.sim = sim;
    this.cameraCtrl = cameraCtrl;
    this.building = building;
    this.environment = environment;

    this.selectedWorker = null;
    this.selectedElevator = null;
    this.activeFloorFocus = null;
    this.showLabels = true;
    this.uiTimer = 0;

    // Cache DOM elements
    this.elClock = document.getElementById('sim-clock');
    this.elPhase = document.getElementById('sim-phase');
    this.elKpiInside = document.getElementById('kpi-inside');
    this.elKpiMeetings = document.getElementById('kpi-meetings');
    this.elKpiWait = document.getElementById('kpi-wait');
    this.elKpiCoffee = document.getElementById('kpi-coffee');
    this.elFloorList = document.getElementById('floor-list');
    this.elElevWidgets = document.getElementById('elevator-widgets');
    this.elInspectorBody = document.getElementById('inspector-body');
    this.elBtnClearInspect = document.getElementById('btn-clear-inspect');
    this.elFeed = document.getElementById('activity-feed');
    this.elLabelsLayer = document.getElementById('labels-layer');

    this.floorCountEls = [];
    this.workerBadgeEls = {};
    this._projVec = new THREE.Vector3();

    this._buildFloorList();
    this._buildWorkerBadges();
    this._bindControls();
    this.refreshHUD();
  }

  UIController.prototype._buildFloorList = function () {
    var self = this;
    this.elFloorList.innerHTML = '';

    // Display floors from Rooftop (6) down to Ground Lobby (0)
    for (var f = OfficeSim.FLOORS.length - 1; f >= 0; f--) {
      (function (floorMeta) {
        var row = document.createElement('div');
        row.className = 'floor-row';
        row.dataset.floor = floorMeta.index;
        row.innerHTML =
          '<div class="floor-left">' +
            '<span class="floor-dot" style="background:' + floorMeta.accent + '"></span>' +
            '<span class="floor-name">' + floorMeta.shortName + ' · ' + floorMeta.name + '</span>' +
          '</div>' +
          '<span class="floor-count" id="fc-' + floorMeta.index + '">0</span>';

        row.addEventListener('click', function () {
          self.selectFloor(floorMeta.index);
        });
        self.elFloorList.appendChild(row);
        self.floorCountEls[floorMeta.index] = row.querySelector('.floor-count');
      })(OfficeSim.FLOORS[f]);
    }
  };

  UIController.prototype._buildWorkerBadges = function () {
    this.elLabelsLayer.innerHTML = '';
    for (var i = 0; i < this.sim.workers.length; i++) {
      var w = this.sim.workers[i];
      var el = document.createElement('div');
      el.className = 'worker-badge';
      el.style.display = 'none';
      this.elLabelsLayer.appendChild(el);
      this.workerBadgeEls[w.id] = el;
    }
  };

  UIController.prototype._bindControls = function () {
    var self = this;

    // Pause / Resume
    var btnPause = document.getElementById('btn-pause');
    btnPause.addEventListener('click', function () {
      self.sim.paused = !self.sim.paused;
      btnPause.textContent = self.sim.paused ? '▶' : '⏸';
      btnPause.classList.toggle('active', self.sim.paused);
    });

    // Spacebar toggles pause
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        btnPause.click();
      }
    });

    // Speed buttons
    var speedBtns = document.querySelectorAll('.speed-btn');
    speedBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.sim.speed = parseFloat(btn.dataset.speed);
        if (self.sim.paused) btnPause.click();
        speedBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    // Time jump presets
    document.querySelectorAll('.chip-btn[data-time]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var h = parseFloat(btn.dataset.time);
        self.sim.jumpToHour(h);
        self.refreshHUD();
      });
    });

    // View Modes (Cutaway / Full Glass / Isolate)
    var viewBtns = document.querySelectorAll('#view-mode-group .seg-btn');
    viewBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.dataset.mode;
        viewBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (mode === 'isolate' && self.activeFloorFocus === null) {
          self.activeFloorFocus = 2; // Default to Engineering if isolating
        }
        self.building.setViewMode(mode, self.activeFloorFocus);
        self._highlightFloorRow();
      });
    });

    // Camera Presets
    document.querySelectorAll('.preset-btn[data-cam]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.cameraCtrl.setPreset(btn.dataset.cam, false);
        self._updateFollowButtons();
      });
    });

    // Toggles
    document.getElementById('toggle-labels').addEventListener('change', function (e) {
      self.showLabels = e.target.checked;
      if (!self.showLabels) {
        for (var k in self.workerBadgeEls) {
          self.workerBadgeEls[k].style.display = 'none';
        }
      }
    });

    document.getElementById('toggle-auto-orbit').addEventListener('change', function (e) {
      self.cameraCtrl.autoOrbit = e.target.checked;
    });

    document.getElementById('toggle-shadows').addEventListener('change', function (e) {
      self.environment.setShadowsEnabled(e.target.checked);
    });

    // Clear inspector
    this.elBtnClearInspect.addEventListener('click', function () {
      self.clearSelection();
    });
  };

  UIController.prototype.selectFloor = function (floorIndex) {
    this.activeFloorFocus = floorIndex;
    this.cameraCtrl.focusFloor(floorIndex);
    if (this.building.viewMode === 'isolate') {
      this.building.setViewMode('isolate', floorIndex);
    }
    this._highlightFloorRow();
  };

  UIController.prototype._highlightFloorRow = function () {
    var rows = this.elFloorList.querySelectorAll('.floor-row');
    var target = this.activeFloorFocus;
    rows.forEach(function (r) {
      r.classList.toggle('active', parseInt(r.dataset.floor, 10) === target);
    });
  };

  UIController.prototype.selectWorker = function (worker) {
    if (this.selectedWorker) this.selectedWorker.setSelected(false);
    this.selectedElevator = null;
    this.selectedWorker = worker;
    if (worker) {
      worker.setSelected(true);
      this.elBtnClearInspect.classList.remove('hidden');
    }
    this._renderInspector();
  };

  UIController.prototype.selectElevator = function (car) {
    if (this.selectedWorker) this.selectedWorker.setSelected(false);
    this.selectedWorker = null;
    this.selectedElevator = car;
    if (car) {
      this.elBtnClearInspect.classList.remove('hidden');
    }
    this._renderInspector();
  };

  UIController.prototype.clearSelection = function () {
    if (this.selectedWorker) this.selectedWorker.setSelected(false);
    this.selectedWorker = null;
    this.selectedElevator = null;
    this.cameraCtrl.setFollow(null);
    this.elBtnClearInspect.classList.add('hidden');
    this._renderInspector();
  };

  UIController.prototype._updateFollowButtons = function () {
    var btn = document.getElementById('btn-follow-entity');
    if (!btn) return;
    var target = this.selectedWorker || this.selectedElevator;
    var following = target && this.cameraCtrl.followTarget === target;
    btn.classList.toggle('following', !!following);
    btn.textContent = following ? '✓ Following Camera' : 'Follow with Camera';
  };

  UIController.prototype._renderInspector = function () {
    var self = this;
    if (this.selectedWorker) {
      var w = this.selectedWorker;
      var fMeta = OfficeSim.FLOORS[w.floor] || OfficeSim.FLOORS[0];
      var following = this.cameraCtrl.followTarget === w;
      this.elInspectorBody.className = 'inspector-card';
      this.elInspectorBody.innerHTML =
        '<div><div class="insp-name">' + w.name + '</div>' +
        '<div class="insp-role">' + w.role + ' · ' + w.dept + '</div></div>' +
        '<div class="insp-row"><span>Activity</span><strong>' + w.activityEmoji + ' ' + w.activityLabel + '</strong></div>' +
        '<div class="insp-row"><span>Location</span><strong>' + fMeta.shortName + ' · ' + fMeta.name + '</strong></div>' +
        '<div class="insp-row"><span>Home Floor</span><strong>' + OfficeSim.FLOORS[w.homeFloor].shortName + '</strong></div>' +
        '<div class="meter-row">' +
          '<div class="meter-label"><span>Energy</span><span>' + Math.round(w.energy) + '%</span></div>' +
          '<div class="meter-track"><div class="meter-fill" style="width:' + w.energy + '%;background:#34d399"></div></div>' +
        '</div>' +
        '<div class="meter-row">' +
          '<div class="meter-label"><span>Caffeine</span><span>' + Math.round(w.caffeine) + '%</span></div>' +
          '<div class="meter-track"><div class="meter-fill" style="width:' + w.caffeine + '%;background:#f59e0b"></div></div>' +
        '</div>' +
        '<button id="btn-follow-entity" class="follow-btn' + (following ? ' following' : '') + '">' +
          (following ? '✓ Following Camera' : 'Follow with Camera') +
        '</button>';

      document.getElementById('btn-follow-entity').addEventListener('click', function () {
        if (self.cameraCtrl.followTarget === w) {
          self.cameraCtrl.setFollow(null);
        } else {
          self.cameraCtrl.setFollow(w, 12);
        }
        self._updateFollowButtons();
      });
    } else if (this.selectedElevator) {
      var c = this.selectedElevator;
      var dirTxt = c.direction > 0 ? '▲ Up' : (c.direction < 0 ? '▼ Down' : '• Idle');
      var followingCar = this.cameraCtrl.followTarget === c;
      this.elInspectorBody.className = 'inspector-card';
      this.elInspectorBody.innerHTML =
        '<div><div class="insp-name">' + c.name + '</div>' +
        '<div class="insp-role">Traction Passenger Elevator</div></div>' +
        '<div class="insp-row"><span>Current Floor</span><strong>' + OfficeSim.FLOORS[c.currentFloor].shortName + '</strong></div>' +
        '<div class="insp-row"><span>Status</span><strong>' + c.state.replace('_', ' ') + ' (' + dirTxt + ')</strong></div>' +
        '<div class="insp-row"><span>Passengers</span><strong>' + c.passengers.length + ' / ' + OfficeSim.CONFIG.ELEVATOR_CAPACITY + '</strong></div>' +
        '<div class="insp-row"><span>Trips Completed</span><strong>' + c.tripsCompleted + '</strong></div>' +
        '<button id="btn-follow-entity" class="follow-btn' + (followingCar ? ' following' : '') + '">' +
          (followingCar ? '✓ Following Camera' : 'Follow Cab') +
        '</button>';

      document.getElementById('btn-follow-entity').addEventListener('click', function () {
        if (self.cameraCtrl.followTarget === c) {
          self.cameraCtrl.setFollow(null);
        } else {
          self.cameraCtrl.setFollow(c, 13);
        }
        self._updateFollowButtons();
      });
    } else {
      this.elInspectorBody.className = 'inspector-empty';
      this.elInspectorBody.textContent = 'Click any worker or elevator cab in the 3D view to inspect and follow them.';
    }
  };

  UIController.prototype.refreshHUD = function () {
    var self = this;
    this.elClock.textContent = U.formatTime(this.sim.simHour);
    this.elPhase.textContent = this.sim.getDayPhase();

    this.elKpiInside.textContent = this.sim.stats.insideCount || 0;
    this.elKpiMeetings.textContent = this.sim.activeMeetings.length;
    this.elKpiWait.textContent = Math.round(this.sim.elevators.getAverageWaitSec()) + 's';
    this.elKpiCoffee.textContent = this.sim.stats.coffeesServed;

    // Floor counts
    for (var f = 0; f < this.floorCountEls.length; f++) {
      if (this.floorCountEls[f]) {
        this.floorCountEls[f].textContent = this.sim.stats.floorCounts[f] || 0;
      }
    }

    // Elevator cards
    this.elElevWidgets.innerHTML = '';
    for (var c = 0; c < this.sim.elevators.cars.length; c++) {
      (function (car) {
        var card = document.createElement('div');
        card.className = 'elev-card';
        var dirSymbol = car.direction > 0 ? '▲' : (car.direction < 0 ? '▼' : '·');
        var loadPct = Math.round((car.passengers.length / OfficeSim.CONFIG.ELEVATOR_CAPACITY) * 100);
        card.innerHTML =
          '<div class="elev-header"><span>' + (car.shaftIndex === 0 ? 'CAR A' : 'CAR B') + '</span><span>' + car.passengers.length + '/' + OfficeSim.CONFIG.ELEVATOR_CAPACITY + '</span></div>' +
          '<div class="elev-floor-big">' + OfficeSim.FLOORS[car.currentFloor].shortName + ' <span class="elev-dir">' + dirSymbol + '</span></div>' +
          '<div class="elev-meta">' + car.state.replace('_', ' ') + '</div>' +
          '<div class="elev-bar-track"><div class="elev-bar-fill" style="width:' + loadPct + '%"></div></div>';
        card.addEventListener('click', function () {
          self.selectElevator(car);
        });
        self.elElevWidgets.appendChild(card);
      })(this.sim.elevators.cars[c]);
    }

    // Activity feed
    var feedHtml = '';
    for (var i = 0; i < Math.min(8, this.sim.feed.length); i++) {
      var item = this.sim.feed[i];
      feedHtml += '<div class="feed-item ' + item.category + '"><span class="feed-time">' + item.time + '</span>' + item.text + '</div>';
    }
    this.elFeed.innerHTML = feedHtml;

    if (this.selectedWorker || this.selectedElevator) {
      this._renderInspector();
    }
  };

  UIController.prototype.update = function (dt, camera) {
    this.uiTimer += dt;
    if (this.uiTimer >= 0.25) {
      this.uiTimer = 0;
      this.refreshHUD();
    }

    // Project floating 2D activity badges for visible workers
    if (!this.showLabels) return;
    var wWidth = window.innerWidth;
    var wHeight = window.innerHeight;
    var camDist = camera.position.distanceTo(this.cameraCtrl.target);

    for (var i = 0; i < this.sim.workers.length; i++) {
      var w = this.sim.workers[i];
      var el = this.workerBadgeEls[w.id];
      if (!el) continue;

      var floorHidden = (this.building.viewMode === 'isolate' && this.building.isolatedFloor !== null && w.floor > this.building.isolatedFloor);
      var showThis = w.group.visible && !floorHidden && (w.selected || camDist < 36 || w.state === 'WAITING_ELEVATOR' || w.state === 'IN_MEETING');

      if (!showThis) {
        el.style.display = 'none';
        continue;
      }

      w.getBadgeWorldPos(this._projVec);
      this._projVec.project(camera);

      if (this._projVec.z > 1) {
        el.style.display = 'none';
        continue;
      }

      var sx = (this._projVec.x * 0.5 + 0.5) * wWidth;
      var sy = (-this._projVec.y * 0.5 + 0.5) * wHeight;
      if (sx < 0 || sx > wWidth || sy < 0 || sy > wHeight) {
        el.style.display = 'none';
        continue;
      }

      el.style.display = 'block';
      el.style.left = sx.toFixed(1) + 'px';
      el.style.top = sy.toFixed(1) + 'px';
      el.className = w.selected ? 'worker-badge selected' : 'worker-badge';
      el.textContent = w.selected ? (w.activityEmoji + ' ' + w.name) : w.activityEmoji;
    }
  };

  OfficeSim.UIController = UIController;
})();
