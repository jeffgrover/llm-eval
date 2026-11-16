import { BUILDING, FLOORS_INFO } from './config.js';

export const CAMERA_PRESETS = {
  overview:   { pos: [34, 24, 42],  target: [0, 9.5, -1] },
  lobby:      { pos: [11, 5.2, 18], target: [0, 1.8, 1.5] },
  elevators:  { pos: [0.5, 11.5, 9], target: [-1.2, 8.5, -7.8] },
  f1:         { pos: [16, 9.6, 17], target: [-1, 5.2, 0.5] },
  f2:         { pos: [-15, 14.0, 17], target: [1, 9.4, 0.5] },
  f3:         { pos: [16, 18.2, 17], target: [-1, 13.6, 1.0] },
  rooftop:    { pos: [23, 24.5, 20], target: [2, 17.6, 1.0] },
  northShaft: { pos: [-16, 16, -28], target: [-1, 10.0, -8.5] }
};

export class UIController {
  constructor(simulation, building, elevators, cameraRig) {
    this.sim = simulation;
    this.building = building;
    this.elevators = elevators;
    this.cameraRig = cameraRig; // { flyTo(pos, target), setFollowWorker(w) }

    this.selectedWorker = null;
    this.followingWorker = false;
    this.lastLogSignature = '';

    this._cacheElements();
    this._bindEvents();
    this._renderFloorButtons();
  }

  _cacheElements() {
    this.elClock = document.getElementById('hud-clock');
    this.elDay = document.getElementById('hud-day');
    this.elPhase = document.getElementById('hud-phase');

    this.elStatInside = document.getElementById('stat-inside');
    this.elStatDesk = document.getElementById('stat-desk');
    this.elStatMeet = document.getElementById('stat-meet');
    this.elStatElev = document.getElementById('stat-elev');
    this.elStatSocial = document.getElementById('stat-social');

    this.elElevTracks = [
      document.getElementById('elev-car-0'),
      document.getElementById('elev-car-1'),
      document.getElementById('elev-car-2')
    ];
    this.elElevMeta = [
      document.getElementById('elev-meta-0'),
      document.getElementById('elev-meta-1'),
      document.getElementById('elev-meta-2')
    ];

    this.elWorkerEmpty = document.getElementById('worker-empty');
    this.elWorkerCard = document.getElementById('worker-card');
    this.elWorkerName = document.getElementById('w-name');
    this.elWorkerRole = document.getElementById('w-role');
    this.elWorkerFloor = document.getElementById('w-floor');
    this.elWorkerState = document.getElementById('w-state');
    this.elWorkerEnergy = document.getElementById('w-energy-bar');
    this.elFollowBtn = document.getElementById('btn-follow-worker');

    this.elFeed = document.getElementById('event-feed');
  }

  _bindEvents() {
    // Speed buttons
    document.querySelectorAll('[data-speed]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = Number(btn.dataset.speed);
        if (val === 0) {
          this.sim.paused = true;
        } else {
          this.sim.paused = false;
          this.sim.timeSpeed = val;
        }
        document.querySelectorAll('[data-speed]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Time-of-Day presets
    document.querySelectorAll('[data-jump-hour]').forEach(btn => {
      btn.addEventListener('click', () => {
        const hr = Number(btn.dataset.jumpHour);
        this.sim.jumpToHour(hr);
      });
    });

    // Camera view presets
    document.querySelectorAll('[data-cam]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.cam;
        const preset = CAMERA_PRESETS[key];
        if (!preset) return;

        this.followingWorker = false;
        this.cameraRig.setFollowWorker(null);
        this._syncFollowButton();

        // Auto-adjust floor slice if clicking a specific interior floor preset
        if (key === 'f1') this._setIsolatedFloor(1);
        else if (key === 'f2') this._setIsolatedFloor(2);
        else if (key === 'f3') this._setIsolatedFloor(3);
        else if (this.building.isolatedFloor !== null && (key === 'overview' || key === 'rooftop' || key === 'northShaft')) {
          this._setIsolatedFloor(null);
        }

        this.cameraRig.flyTo(preset.pos, preset.target);
        document.querySelectorAll('[data-cam]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Facade Cutaway Mode buttons
    document.querySelectorAll('[data-facade]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.facade;
        this.building.applyViewMode(mode, this.building.isolatedFloor);
        document.querySelectorAll('[data-facade]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Toggle activity bubbles
    const bubbleToggle = document.getElementById('toggle-bubbles');
    if (bubbleToggle) {
      bubbleToggle.addEventListener('change', e => {
        this.sim.showActivityBubbles = e.target.checked;
      });
    }

    // Trigger Cross-Floor Meeting button
    const meetBtn = document.getElementById('btn-trigger-meeting');
    if (meetBtn) {
      meetBtn.addEventListener('click', () => {
        const ok = this.sim.triggerTeamMeeting();
        if (!ok) {
          this.sim.logEvent('ℹ️ All conference rooms currently hosting active sessions.');
        }
      });
    }

    // Spotlight Random Active Worker button
    const pickBtn = document.getElementById('btn-pick-worker');
    if (pickBtn) {
      pickBtn.addEventListener('click', () => {
        const inside = this.sim.workers.filter(w => w.state !== 'OFFSITE');
        if (inside.length > 0) {
          const nextIdx = this.selectedWorker
            ? (inside.indexOf(this.selectedWorker) + 1) % inside.length
            : 0;
          this.selectWorker(inside[Math.max(0, nextIdx)]);
        }
      });
    }

    // Follow Worker Camera toggle
    if (this.elFollowBtn) {
      this.elFollowBtn.addEventListener('click', () => {
        if (!this.selectedWorker) return;
        this.followingWorker = !this.followingWorker;
        this.cameraRig.setFollowWorker(this.followingWorker ? this.selectedWorker : null);
        this._syncFollowButton();
      });
    }

    // Clear worker selection
    const clearBtn = document.getElementById('btn-clear-worker');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.selectWorker(null));
    }

    // Collapsible HUD toggle
    const hudToggle = document.getElementById('btn-toggle-hud');
    if (hudToggle) {
      hudToggle.addEventListener('click', () => {
        document.body.classList.toggle('hud-minimized');
        hudToggle.textContent = document.body.classList.contains('hud-minimized') ? 'Show Panels' : 'Hide Panels';
      });
    }
  }

  _renderFloorButtons() {
    const container = document.getElementById('floor-slice-btns');
    if (!container) return;

    const allBtn = document.createElement('button');
    allBtn.className = 'chip active';
    allBtn.dataset.floorSlice = 'all';
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', () => this._setIsolatedFloor(null));
    container.appendChild(allBtn);

    FLOORS_INFO.forEach(fi => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.floorSlice = String(fi.index);
      b.textContent = fi.short;
      b.title = `${fi.name} (${fi.dept})`;
      b.addEventListener('click', () => this._setIsolatedFloor(fi.index));
      container.appendChild(b);
    });
  }

  _setIsolatedFloor(floorOrNull) {
    this.building.applyViewMode(this.building.cutawayMode, floorOrNull);
    document.querySelectorAll('[data-floor-slice]').forEach(b => {
      const match = floorOrNull === null
        ? b.dataset.floorSlice === 'all'
        : Number(b.dataset.floorSlice) === floorOrNull;
      b.classList.toggle('active', match);
    });
  }

  selectWorker(worker) {
    if (this.selectedWorker) {
      this.selectedWorker.selected = false;
    }
    this.selectedWorker = worker;
    if (worker) {
      worker.selected = true;
      this.elWorkerEmpty.classList.add('hidden');
      this.elWorkerCard.classList.remove('hidden');
      if (this.followingWorker) {
        this.cameraRig.setFollowWorker(worker);
      }
    } else {
      this.followingWorker = false;
      this.cameraRig.setFollowWorker(null);
      this.elWorkerEmpty.classList.remove('hidden');
      this.elWorkerCard.classList.add('hidden');
    }
    this._syncFollowButton();
  }

  _syncFollowButton() {
    if (!this.elFollowBtn) return;
    this.elFollowBtn.textContent = this.followingWorker ? 'Following (Click to Free)' : 'Follow Camera';
    this.elFollowBtn.classList.toggle('active', this.followingWorker);
  }

  update() {
    // 1. Top Clock & Phase
    this.elClock.textContent = this.sim.formatClock(this.sim.simHour);
    this.elDay.textContent = this.sim.getWeekdayName();
    this.elPhase.textContent = this.sim.getDayPhaseLabel();

    // 2. Office Metrics
    const m = this.sim.getOfficeMetrics();
    this.elStatInside.textContent = `${m.inside}/${m.total}`;
    this.elStatDesk.textContent = String(m.atDesk);
    this.elStatMeet.textContent = String(m.inMeetings);
    this.elStatElev.textContent = String(m.elevatorOrStairs);
    this.elStatSocial.textContent = String(m.socialOrBreak);

    // 3. Elevator Telemetry Visualizer
    const tel = this.elevators.getTelemetry();
    tel.forEach((car, i) => {
      const cabEl = this.elElevTracks[i];
      const metaEl = this.elElevMeta[i];
      if (!cabEl || !metaEl) return;

      const pct = Math.max(0, Math.min(100, car.yNorm * 80)); // 80% max so 20%-tall car fits cleanly
      cabEl.style.bottom = `${pct}%`;
      cabEl.classList.toggle('doors-open', car.state === 'BOARDING' || car.state === 'DOORS_OPENING');

      const arrow = car.direction > 0 ? '▲' : (car.direction < 0 ? '▼' : '•');
      const flLabel = car.floor === 0 ? 'G' : `F${car.floor}`;
      metaEl.textContent = `${flLabel} ${arrow} ${car.passengers}/${car.capacity}`;
    });

    // 4. Selected Worker Inspector
    if (this.selectedWorker) {
      const w = this.selectedWorker;
      this.elWorkerName.textContent = w.name;
      this.elWorkerRole.textContent = `${w.profile.role} · ${w.profile.dept}`;
      const curFl = w.floor === 0 ? 'Ground Atrium' : `Floor ${w.floor}`;
      const homeFl = w.profile.homeFloor === 0 ? 'Ground' : `F${w.profile.homeFloor}`;
      this.elWorkerFloor.textContent = `Location: ${curFl} (Home: ${homeFl})`;
      this.elWorkerState.textContent = `${w.activityEmoji} ${w.activityLabel}${w.hasCoffee ? ' · ☕ Espresso' : ''}`;
      this.elWorkerEnergy.style.width = `${Math.round(w.energy * 100)}%`;
    }

    // 5. Event Log Feed (re-render only when new entry arrives)
    const topSig = this.sim.eventLog[0] ? `${this.sim.eventLog[0].time}:${this.sim.eventLog[0].text}` : '';
    if (topSig !== this.lastLogSignature) {
      this.lastLogSignature = topSig;
      this.elFeed.innerHTML = this.sim.eventLog
        .slice(0, 8)
        .map(item => `<div class="feed-item"><span class="feed-time">${item.time}</span><span>${item.text}</span></div>`)
        .join('');
    }
  }
}
