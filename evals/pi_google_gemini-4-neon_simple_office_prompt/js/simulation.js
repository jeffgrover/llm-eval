(function () {
  'use strict';

  var OfficeSim = (window.OfficeSim = window.OfficeSim || {});
  var CFG = OfficeSim.CONFIG;
  var U = OfficeSim.Utils;

  var MEETING_TITLES = [
    'Architecture Review',
    'Design Critique',
    'Sprint Planning',
    'Q3 Pipeline Sync',
    'Product Roadmap',
    'Executive Strategy',
    'UX Research Debrief',
    'Launch Readiness'
  ];

  function Simulation(scene, building, environment) {
    this.scene = scene;
    this.building = building;
    this.environment = environment;
    this.elevators = new OfficeSim.ElevatorSystem(building, scene);

    this.workers = [];
    this.activeMeetings = [];
    this.feed = [];

    this.simHour = CFG.START_HOUR;
    this.speed = 1;
    this.paused = false;
    this.realElapsed = 0;

    this.nextMeetingCooldown = 9; // seconds until first meeting triggers
    this.stats = {
      coffeesServed: 0,
      meetingsHeld: 0,
      floorCounts: [0, 0, 0, 0, 0, 0, 0]
    };

    this._spawnWorkers();
    this._seedInitialMorningState();
    this.addEvent('Apex Tower opens for the workday.', 'rush');
  }

  Simulation.prototype._spawnWorkers = function () {
    var P = OfficeSim.WORKER_PROFILES;
    var stations = this.building.workstations;
    var usedNames = {};

    for (var i = 0; i < stations.length && i < CFG.WORKER_COUNT; i++) {
      var ws = stations[i];
      var name;
      var guard = 0;
      do {
        name = U.pick(P.firstNames) + ' ' + U.pick(P.lastNames);
        guard++;
      } while (usedNames[name] && guard < 30);
      usedNames[name] = true;

      var roles = P.rolesByFloor[ws.floor] || ['Specialist'];
      var profile = {
        name: name,
        role: roles[i % roles.length],
        dept: ws.dept,
        skin: U.pick(P.skinTones),
        hair: U.pick(P.hairColors),
        outfit: U.pick(P.outfitColors),
        pants: U.pick(P.pantsColors)
      };

      var w = new OfficeSim.Worker('w_' + i, profile, ws, this.scene);
      this.workers.push(w);
    }
  };

  Simulation.prototype._seedInitialMorningState = function () {
    // At 08:15 AM, ~45% are already at desks, ~30% are arriving right now in the plaza/lobby/elevators, ~25% arrive shortly
    for (var i = 0; i < this.workers.length; i++) {
      var w = this.workers[i];
      if (i % 3 === 0) {
        w.teleportToWorkState();
        w.arrivalHour = 7.9;
      } else if (i % 3 === 1) {
        w.arrivalHour = 8.15;
        w.arriveForDay(this);
        // Stagger initial positions from plaza into lobby for immediate lively motion!
        w.x = U.rand(-5, 5);
        w.z = U.rand(10.5, 22.0);
        w.group.position.set(w.x, 0, w.z);
      } else {
        w.arrivalHour = U.rand(8.3, 9.15);
        w.group.visible = false;
      }
    }
  };

  Simulation.prototype.addEvent = function (text, category) {
    this.feed.unshift({
      time: U.formatTime(this.simHour),
      text: text,
      category: category || 'info'
    });
    if (this.feed.length > 26) {
      this.feed.pop();
    }
  };

  Simulation.prototype.getDayPhase = function () {
    var h = this.simHour;
    if (h < 7.5) return 'Early Morning';
    if (h < 9.5) return 'Morning Arrival';
    if (h < 11.8) return 'Deep Work';
    if (h < 13.7) return 'Lunch Rush';
    if (h < 16.5) return 'Afternoon Sprint';
    if (h < 18.8) return 'Evening Departure';
    return 'After Hours';
  };

  Simulation.prototype.jumpToHour = function (targetHour) {
    this.simHour = targetHour;
    // Clear active meetings cleanly
    for (var m = 0; m < this.activeMeetings.length; m++) {
      this.activeMeetings[m].room.busy = false;
      this.activeMeetings[m].room.meeting = null;
    }
    this.activeMeetings = [];

    // Clear elevator queues
    for (var f = 0; f <= CFG.ROOF_FLOOR; f++) {
      this.elevators.waitingByFloor[f] = [];
    }
    for (var c = 0; c < this.elevators.cars.length; c++) {
      var car = this.elevators.cars[c];
      car.passengers = [];
      car.boardingWorkers = [];
      car.carStops = {};
      car.hallStops = {};
      car.state = 'IDLE';
      car.doorOpen = 0;
      for (var sf = 0; sf <= CFG.ROOF_FLOOR; sf++) {
        this.building.setShaftDoorOpen(sf, c, 0);
        this.building.setHallLantern(sf, c, 0);
      }
    }

    // Re-position workers realistically for the chosen hour
    for (var i = 0; i < this.workers.length; i++) {
      var w = this.workers[i];
      w.hasHadLunch = targetHour > 13.5;

      if (targetHour < 8.5) {
        // Morning rush!
        if (i % 3 === 0) {
          w.teleportToWorkState();
        } else {
          w.arrivalHour = U.rand(7.9, 8.7);
          w.arriveForDay(this);
          w.x = U.rand(-10, 10);
          w.z = U.rand(11, 23);
          w.group.position.set(w.x, 0, w.z);
        }
      } else if (targetHour >= 12.0 && targetHour <= 13.2) {
        // Lunch rush!
        w.teleportToWorkState();
        if (i % 2 === 0) {
          w.goForLunch(this);
        }
      } else if (targetHour >= 19.0) {
        // After hours — only a few night-owl engineers & executives remain!
        if (i % 6 === 0) {
          w.teleportToWorkState();
          w.departureHour = 21.5;
        } else {
          w.state = 'OUTSIDE_AWAY';
          w.group.visible = false;
          w.activityLabel = 'Off Shift';
        }
      } else {
        // Standard busy workday
        w.teleportToWorkState();
        if (i % 5 === 0) {
          w.goForCoffee(this);
        }
      }
    }

    this.nextMeetingCooldown = 4;
    this.addEvent('Time jumped to ' + U.formatTime(targetHour) + ' (' + this.getDayPhase() + ').', 'rush');
  };

  Simulation.prototype._updateMeetings = function (dt) {
    // Update active meetings
    for (var i = this.activeMeetings.length - 1; i >= 0; i--) {
      var mtg = this.activeMeetings[i];
      mtg.timeLeft -= dt;
      if (mtg.timeLeft <= 0) {
        mtg.room.busy = false;
        mtg.room.meeting = null;
        for (var p = 0; p < mtg.participants.length; p++) {
          var w = mtg.participants[p];
          if (w.currentMeeting === mtg) {
            w.leaveMeeting(this);
          }
        }
        this.addEvent(mtg.title + ' concluded in ' + mtg.room.name + '.', 'meeting');
        this.activeMeetings.splice(i, 1);
      }
    }

    // Schedule new meetings during core business hours (9:00 - 17:00)
    if (this.simHour >= 8.3 && this.simHour <= 17.2) {
      this.nextMeetingCooldown -= dt;
      if (this.nextMeetingCooldown <= 0) {
        this._tryScheduleMeeting();
        this.nextMeetingCooldown = U.rand(18, 32);
      }
    }
  };

  Simulation.prototype._tryScheduleMeeting = function () {
    var freeRooms = this.building.meetingRooms.filter(function (r) { return !r.busy; });
    if (freeRooms.length === 0) return;

    var available = this.workers.filter(function (w) {
      return w.state === 'WORKING' && w.homeFloor >= 2 && !w.currentMeeting;
    });
    if (available.length < 3) return;

    var room = U.pick(freeRooms);
    var count = Math.min(available.length, Math.min(room.seats.length + 1, Math.floor(U.rand(3, 6))));

    // Shuffle and pick participants (bias slightly toward room's floor)
    available.sort(function (a, b) {
      var scoreA = (a.homeFloor === room.floor ? -0.4 : 0) + Math.random();
      var scoreB = (b.homeFloor === room.floor ? -0.4 : 0) + Math.random();
      return scoreA - scoreB;
    });

    var participants = available.slice(0, count);
    var title = U.pick(MEETING_TITLES);
    var meeting = {
      id: 'mtg_' + Date.now(),
      title: title,
      room: room,
      participants: participants,
      timeLeft: U.rand(26, 42)
    };

    room.busy = true;
    room.meeting = meeting;
    this.activeMeetings.push(meeting);
    this.stats.meetingsHeld++;

    // First participant is the presenter, others take seats around the table
    for (var i = 0; i < participants.length; i++) {
      var w = participants[i];
      if (i === 0) {
        w.goToMeeting(meeting, room.presenterSpot, true, this);
      } else {
        w.goToMeeting(meeting, room.seats[i - 1], false, this);
      }
    }

    this.addEvent(
      participants[0].name + ' started "' + title + '" in ' + room.name + ' (' + participants.length + ' attending).',
      'meeting'
    );
  };

  Simulation.prototype.update = function (realDt) {
    this.realElapsed += realDt;
    var simDt = this.paused ? 0 : realDt * this.speed;

    // Clamp large simulation steps to keep kinematics crisp
    var subSteps = simDt > 0.12 ? Math.min(8, Math.ceil(simDt / 0.08)) : 1;
    var stepDt = simDt / subSteps;

    for (var s = 0; s < subSteps; s++) {
      if (stepDt > 0) {
        this.simHour += (stepDt * CFG.SIM_MINUTES_PER_REAL_SEC) / 60;
        if (this.simHour >= 24) {
          this.simHour -= 24;
          // Reset daily flags at midnight
          for (var r = 0; r < this.workers.length; r++) {
            this.workers[r].hasHadLunch = false;
          }
        }

        this.elevators.update(stepDt);
        this._updateMeetings(stepDt);

        for (var i = 0; i < this.workers.length; i++) {
          this.workers[i].update(stepDt, this);
        }
      }
    }

    // Check if any worker is near the lobby entrance sliding doors
    var lobbyDoorActive = false;
    for (var f = 0; f <= CFG.ROOF_FLOOR; f++) this.stats.floorCounts[f] = 0;
    var insideCount = 0;

    for (var j = 0; j < this.workers.length; j++) {
      var w = this.workers[j];
      if (w.isInsideBuilding()) {
        insideCount++;
        if (w.floor >= 0 && w.floor <= CFG.ROOF_FLOOR) {
          this.stats.floorCounts[w.floor]++;
        }
      }
      if (w.floor === 0 && Math.abs(w.x) < 3.0 && w.z > 6.8 && w.z < 11.4 && w.state !== 'OUTSIDE_AWAY') {
        lobbyDoorActive = true;
      }
    }
    this.stats.insideCount = insideCount;

    // Update environment & building visuals
    this.environment.update(this.paused ? 0 : realDt * Math.min(this.speed, 4), this.simHour, this.realElapsed);
    this.building.update(realDt, this.realElapsed, this.environment.nightFactor || 0, lobbyDoorActive);
  };

  OfficeSim.Simulation = Simulation;
})();
