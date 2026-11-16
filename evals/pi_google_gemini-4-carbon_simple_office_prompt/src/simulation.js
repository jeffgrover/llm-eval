import {
  BUILDING,
  MEETING_TEMPLATES,
  CHAT_TOPICS,
  generateWorkerProfiles
} from './config.js';
import { Worker } from './worker.js';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export class OfficeSimulation {
  constructor(scene, building, elevatorSystem, outdoorEnv, navigator) {
    this.scene = scene;
    this.building = building;
    this.elevators = elevatorSystem;
    this.outdoor = outdoorEnv;
    this.navigator = navigator;

    // Simulation clock: start at 08:28 AM on Tuesday (prime morning activity!)
    this.simHour = 8.47;
    this.dayIndex = 1; // Tuesday
    this.timeSpeed = 1; // 1x real-feel sim pace (1 real sec = 1.5 sim min at 1x)
    this.paused = false;
    this.showActivityBubbles = true;

    this.workers = [];
    this.activeMeetings = [];
    this.eventLog = [];
    this.microBehaviorCooldown = 2.5;
    this.autoMeetingCooldown = 14.0;

    this._spawnRosterAndAssignDesks();
    this._seedInitialMorningState();
  }

  _spawnRosterAndAssignDesks() {
    const profiles = generateWorkerProfiles();
    const floorDeskCursors = { 1: 0, 2: 0, 3: 0 };

    for (const prof of profiles) {
      const w = new Worker(prof, this.scene, this.navigator, this.elevators, this.building);

      if (prof.isReception) {
        w.homeDesk = this.building.receptionSpot;
      } else if (prof.isBarista) {
        w.homeDesk = this.building.baristaSpot;
      } else if (prof.isExec && this.building.execDesks[prof.isExec]) {
        w.homeDesk = this.building.execDesks[prof.isExec];
        w.homeDesk.assignedTo = w;
      } else {
        const list = this.building.desksByFloor[prof.homeFloor] || [];
        const idx = floorDeskCursors[prof.homeFloor] || 0;
        if (list[idx]) {
          w.homeDesk = list[idx];
          list[idx].assignedTo = w;
          floorDeskCursors[prof.homeFloor] = idx + 1;
        }
      }

      this.workers.push(w);
    }
  }

  _seedInitialMorningState() {
    // Workers whose arrivalHour < 8.38 are already inside working or grabbing coffee;
    // Workers between 8.38 and 8.55 are actively walking across the plaza/lobby right now!
    for (const w of this.workers) {
      if (w.profile.arrivalHour < 8.32) {
        w.hasArrivedToday = true;
        w.inBuilding = true;
        w.mesh.visible = true;

        if (w.profile.isReception && this.building.receptionSpot) {
          w.floor = 0;
          w.x = this.building.receptionSpot.x;
          w.z = this.building.receptionSpot.z;
          w.y = 0;
          w.state = 'RECEPTION_DUTY';
          w.setBadge('🛎️', 'Concierge', '#0f172a');
        } else if (w.profile.isBarista && this.building.baristaSpot) {
          w.floor = 0;
          w.x = this.building.baristaSpot.x;
          w.z = this.building.baristaSpot.z;
          w.y = 0;
          w.state = 'BARISTA_DUTY';
          w.setBadge('☕', 'Espresso Bar', '#451a03');
        } else if (w.homeDesk) {
          w.floor = w.homeDesk.floor;
          w.x = w.homeDesk.x;
          w.z = w.homeDesk.z;
          w.y = w.floor * BUILDING.floorHeight;
          w.currentGate = w.homeDesk.gate || null;
          w.state = 'DESK_WORK';
          w.setBadge('💻', 'Focused Work', '#0f172a');
          w.homeDesk.monitorMeshes.forEach(m => { m.mat.emissiveIntensity = 0.95; });
        }
      } else if (w.profile.arrivalHour <= this.simHour + 0.08) {
        // Actively arriving across plaza right at scene start!
        w.hasArrivedToday = true;
        w.floor = 0;
        w.y = 0;
        w.x = (w.id % 2 === 0 ? -1 : 1) * (2.5 + (w.id % 5) * 3.8);
        w.z = 14.5 + (w.id % 6) * 2.4;
        w.mesh.visible = true;
        w.returnToHomeStation();
        w.setBadge('🚶', `Arriving → F${w.profile.homeFloor}`, '#1e3a8a');
      }
    }

    this.logEvent('🌅 Morning rush underway — early teams settled, commuters entering atrium.');

    // Kick off one lively morning standup in F2 Apollo Boardroom shortly after launch
    this.autoMeetingCooldown = 6.0;
  }

  logEvent(text) {
    const timeStr = this.formatClock(this.simHour);
    this.eventLog.unshift({ time: timeStr, text });
    if (this.eventLog.length > 24) this.eventLog.pop();
  }

  formatClock(hourFloat) {
    const wrapped = ((hourFloat % 24) + 24) % 24;
    const totalMins = Math.floor(wrapped * 60);
    const h24 = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${String(h12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`;
  }

  getDayPhaseLabel() {
    const h = this.simHour;
    if (h < 6.5) return 'Pre-Dawn Quiet';
    if (h < 9.3) return 'Morning Arrival Rush';
    if (h < 11.8) return 'Morning Deep Work & Standups';
    if (h < 13.5) return 'Midday Lunch & Sky Deck';
    if (h < 16.8) return 'Afternoon Collaboration';
    if (h < 19.0) return 'Golden Hour Departure';
    return 'Evening Security & Night Shift';
  }

  getWeekdayName() {
    return WEEKDAYS[this.dayIndex % WEEKDAYS.length];
  }

  // ==================== Time Jump Presets ====================

  jumpToHour(targetHour) {
    // End any active meetings cleanly
    for (const m of this.activeMeetings) {
      m.room.activeMeeting = null;
      m.room.screenMat.emissiveIntensity = 0.08;
    }
    this.activeMeetings = [];

    // Clear elevator queues & cabs cleanly
    for (const car of this.elevators.cars) {
      car.passengers = [];
      car.slotOccupancy.fill(null);
      car.carCalls.clear();
      car.state = 'IDLE';
      car.doorOpen = 0;
      car.velocity = 0;
      car.y = car.currentFloor * BUILDING.floorHeight;
    }
    this.elevators.hallCalls.clear();
    for (let f = 0; f < BUILDING.numFloors; f++) {
      this.elevators.hallWaiters[f] = [];
      this.elevators.floorWaitSlots[f].forEach(s => { s.occupiedBy = null; });
    }

    this.simHour = targetHour;

    for (const w of this.workers) {
      w._releaseCurrentResources();
      w.pendingGoal = null;
      w.elevatorCar = null;
      w.hasHadLunchToday = targetHour > 13.4;

      const shouldBeIn = targetHour >= w.profile.arrivalHour && targetHour < w.profile.departureHour;

      if (!shouldBeIn) {
        // Place some commuters on plaza if jumping right into morning rush or sunset rush!
        if (Math.abs(targetHour - w.profile.arrivalHour) < 0.25) {
          w.hasArrivedToday = true;
          w.floor = 0;
          w.y = 0;
          w.x = (w.id % 2 === 0 ? -1 : 1) * (3 + (w.id % 6) * 3.2);
          w.z = 16 + (w.id % 5) * 2.5;
          w.mesh.visible = true;
          w.returnToHomeStation();
          w.setBadge('🚶', `Arriving → F${w.profile.homeFloor}`, '#1e3a8a');
        } else {
          w.hasArrivedToday = targetHour >= w.profile.departureHour;
          w.inBuilding = false;
          w.state = 'OFFSITE';
          w.floor = 0;
          w.x = w.spawnSide * 36;
          w.z = 28.5;
          w.mesh.visible = false;
        }
      } else {
        w.hasArrivedToday = true;
        w.inBuilding = true;
        w.mesh.visible = true;

        if (w.profile.isReception && this.building.receptionSpot) {
          w.floor = 0; w.y = 0;
          w.x = this.building.receptionSpot.x; w.z = this.building.receptionSpot.z;
          w.state = 'RECEPTION_DUTY';
        } else if (w.profile.isBarista && this.building.baristaSpot) {
          w.floor = 0; w.y = 0;
          w.x = this.building.baristaSpot.x; w.z = this.building.baristaSpot.z;
          w.state = 'BARISTA_DUTY';
        } else if (w.homeDesk) {
          w.floor = w.homeDesk.floor;
          w.y = w.floor * BUILDING.floorHeight;
          w.x = w.homeDesk.x;
          w.z = w.homeDesk.z;
          w.currentGate = w.homeDesk.gate || null;
          w.state = 'DESK_WORK';
          w.setBadge('💻', 'Focused Work', '#0f172a');
          w.homeDesk.monitorMeshes.forEach(m => { m.mat.emissiveIntensity = 0.95; });
        }
      }
    }

    // Trigger immediate context-appropriate activity for the chosen preset!
    if (targetHour >= 12.0 && targetHour <= 13.2) {
      // Send ~10 workers to Rooftop Sky Deck & Patio for lunch!
      let sent = 0;
      for (const w of this.workers) {
        if (w.isAvailableForSocialOrMeeting() && sent < 10) {
          w.hasHadLunchToday = true;
          this._sendWorkerToLunch(w);
          sent++;
        }
      }
      this.logEvent('🥗 Midday lunch rush — teams heading to F4 Sky Deck & Courtyard.');
    } else if (targetHour >= 9.5 && targetHour <= 16.5) {
      this.triggerTeamMeeting();
    } else if (targetHour >= 17.2 && targetHour <= 18.5) {
      // Trigger departure wave for several workers
      let leaving = 0;
      for (const w of this.workers) {
        if (w.isAvailableForSocialOrMeeting() && leaving < 9) {
          this._sendWorkerHome(w);
          leaving++;
        }
      }
      this.logEvent('🌇 Evening departure wave — teams taking elevators down to plaza.');
    } else {
      this.logEvent(`⏱️ Jumped simulation clock to ${this.formatClock(targetHour)}.`);
    }
  }

  // ==================== Dynamic Events & Interactions ====================

  triggerTeamMeeting(preferredFloor = null) {
    // Pick a free conference room
    const freeRooms = this.building.meetingRooms.filter(r => !r.activeMeeting);
    if (freeRooms.length === 0) return false;

    let room = null;
    if (preferredFloor !== null) {
      room = freeRooms.find(r => r.floor === preferredFloor) || freeRooms[0];
    } else {
      room = freeRooms[Math.floor(Math.random() * freeRooms.length)];
    }

    const template =
      MEETING_TEMPLATES.find(t => t.preferredFloor === room.floor) ||
      MEETING_TEMPLATES[Math.floor(Math.random() * MEETING_TEMPLATES.length)];

    const candidates = this.workers.filter(w => w.isAvailableForSocialOrMeeting());
    if (candidates.length < 3) return false;

    // Mix attendees from the room's floor AND other floors so elevators see real cross-floor meeting traffic!
    const sameFloor = candidates.filter(w => w.floor === room.floor);
    const otherFloors = candidates.filter(w => w.floor !== room.floor);

    const shuffle = arr => arr.sort(() => Math.random() - 0.5);
    shuffle(sameFloor);
    shuffle(otherFloors);

    const desiredCount = Math.min(room.seats.length, template.maxAttendees, candidates.length);
    const chosen = [
      ...sameFloor.slice(0, Math.ceil(desiredCount * 0.5)),
      ...otherFloors.slice(0, Math.floor(desiredCount * 0.5))
    ].slice(0, desiredCount);

    if (chosen.length < 2) return false;

    const durationRealSec = 48; // sim-scaled seconds in meeting
    const meeting = {
      title: template.title,
      room,
      attendees: chosen,
      remainingSec: durationRealSec
    };

    room.activeMeeting = meeting;
    room.screenMat.emissiveIntensity = 1.12;
    this.activeMeetings.push(meeting);

    chosen.forEach((worker, idx) => {
      const seat = room.seats[idx];
      worker.goTo(
        {
          floor: room.floor,
          x: seat.x,
          z: seat.z,
          faceX: seat.faceX,
          faceZ: seat.faceZ,
          gate: room.gate,
          seatRef: seat
        },
        'IN_MEETING',
        durationRealSec + 20,
        { emoji: '📊', label: `Meeting F${room.floor}`, bg: '#312e81' }
      );
    });

    this.logEvent(`📊 ${room.name}: "${template.title}" (${chosen.length} attendees)`);
    return true;
  }

  _sendWorkerToLunch(worker) {
    // 65% Penthouse Sky Deck / Cafeteria (Floor 4), 20% Outdoor Courtyard Patio, 15% Lobby Café
    const allLunch = [
      ...this.building.lunchSeats.filter(s => !s.occupiedBy),
      ...this.outdoor.outdoorSeats.filter(s => !s.occupiedBy)
    ];
    if (allLunch.length === 0) return;

    // Prefer Floor 4 Rooftop Café & Sky Deck!
    const roofSeats = allLunch.filter(s => s.floor === 4);
    const seat = roofSeats.length > 0 && Math.random() < 0.72
      ? roofSeats[Math.floor(Math.random() * roofSeats.length)]
      : allLunch[Math.floor(Math.random() * allLunch.length)];

    const label = seat.floor === 4 ? 'Sky Deck Lunch' : (seat.isOutdoor ? 'Patio Lunch' : 'Café Lunch');
    worker.goTo(
      {
        floor: seat.floor,
        x: seat.x,
        z: seat.z,
        faceX: seat.faceX,
        faceZ: seat.faceZ,
        gate: seat.gate || null,
        seatRef: seat
      },
      'LUNCH',
      46,
      { emoji: '🥗', label, bg: '#065f46' }
    );
  }

  _sendWorkerForCoffee(worker) {
    // 70% same-floor espresso station, 30% trip to Lobby Barista (F0) or Penthouse Café (F4)
    const sameFloorSpot = this.building.coffeeSpots.find(c => c.floor === worker.floor);
    const allSpots = this.building.coffeeSpots;
    const spot = (sameFloorSpot && Math.random() < 0.68)
      ? sameFloorSpot
      : allSpots[Math.floor(Math.random() * allSpots.length)];

    if (!spot) return;
    // Slight jitter so two coffee seekers stand side by side
    const jitterX = (Math.random() - 0.5) * 0.65;
    worker.goTo(
      {
        floor: spot.floor,
        x: spot.x + jitterX,
        z: spot.z,
        faceX: spot.faceX,
        faceZ: spot.faceZ,
        gate: spot.gate
      },
      'GETTING_COFFEE',
      11,
      { emoji: '☕', label: spot.label, bg: '#78350f' }
    );
  }

  _triggerWatercoolerChat() {
    const cooler = this.building.waterCoolers[Math.floor(Math.random() * this.building.waterCoolers.length)];
    if (!cooler) return;

    const avail = this.workers.filter(w => w.isAvailableForSocialOrMeeting());
    if (avail.length < 2) return;

    // Prefer at least one worker already on that floor
    const local = avail.filter(w => w.floor === cooler.floor);
    const w1 = local.length > 0 ? local[Math.floor(Math.random() * local.length)] : avail[0];
    const rest = avail.filter(w => w !== w1);
    const sameRest = rest.filter(w => w.floor === cooler.floor);
    const w2 = sameRest.length > 0 && Math.random() < 0.75
      ? sameRest[Math.floor(Math.random() * sameRest.length)]
      : rest[Math.floor(Math.random() * rest.length)];

    if (!w1 || !w2) return;

    const topic = CHAT_TOPICS[Math.floor(Math.random() * CHAT_TOPICS.length)];
    w1.partner = w2;
    w2.partner = w1;

    w1.goTo(
      { floor: cooler.floor, x: cooler.x, z: cooler.z, faceX: cooler.partnerX, faceZ: cooler.partnerZ },
      'SOCIALIZING',
      24,
      { emoji: '💬', label: 'Watercooler Chat', bg: '#0e7490' }
    );
    w2.goTo(
      { floor: cooler.floor, x: cooler.partnerX, z: cooler.partnerZ, faceX: cooler.x, faceZ: cooler.z },
      'SOCIALIZING',
      24,
      { emoji: '💬', label: 'Watercooler Chat', bg: '#0e7490' }
    );

    this.logEvent(`💬 ${w1.name.split(' ')[0]} & ${w2.name.split(' ')[0]} ${topic} (F${cooler.floor})`);
  }

  _triggerPeerDeskVisit() {
    const deskWorkers = this.workers.filter(w => w.state === 'DESK_WORK' && w.homeDesk && !w.homeDesk.gate);
    if (deskWorkers.length < 2) return;

    const host = deskWorkers[Math.floor(Math.random() * deskWorkers.length)];
    const visitors = deskWorkers.filter(w => w !== host);
    const visitor = visitors[Math.floor(Math.random() * visitors.length)];
    if (!visitor) return;

    visitor.partner = host;
    const offsetSide = visitor.id % 2 === 0 ? 0.72 : -0.72;
    visitor.goTo(
      {
        floor: host.floor,
        x: host.x + offsetSide,
        z: host.z + (host.z > host.homeDesk.faceZ ? 0.28 : -0.28),
        faceX: host.x,
        faceZ: host.z
      },
      'PEER_COLLAB',
      22,
      { emoji: '🤝', label: `Sync w/ ${host.name.split(' ')[0]}`, bg: '#4338ca' }
    );
  }

  _triggerPhoneCall() {
    const freeBooths = this.building.phoneBooths.filter(b => !b.occupiedBy);
    if (freeBooths.length === 0) return;

    const avail = this.workers.filter(w => w.isAvailableForSocialOrMeeting());
    if (avail.length === 0) return;

    const caller = avail[Math.floor(Math.random() * avail.length)];
    const booth = freeBooths.find(b => b.floor === caller.floor) || freeBooths[0];

    caller.goTo(
      {
        floor: booth.floor,
        x: booth.x,
        z: booth.z,
        faceX: booth.faceX,
        faceZ: booth.faceZ,
        gate: booth.gate,
        boothRef: booth
      },
      'PHONE_CALL',
      25,
      { emoji: '📱', label: 'Client Call', bg: '#1e293b' }
    );
  }

  _sendWorkerHome(worker) {
    const exitX = worker.spawnSide * (34 + (worker.id % 5) * 2.5);
    const exitZ = 28.5 + (worker.id % 3) * 0.4;
    worker.goTo(
      { floor: 0, x: exitX, z: exitZ, faceX: exitX + worker.spawnSide * 5, faceZ: exitZ },
      'DEPARTED_OFFSITE',
      5,
      { emoji: '🏠', label: 'Heading Home', bg: '#334155' }
    );
  }

  // ==================== Main Frame Update ====================

  update(realDt, elapsedReal) {
    const effectiveSpeed = this.paused ? 0 : this.timeSpeed;
    // At 1x speed: 1 real second = 0.022 sim hours (~80 seconds per simulated hour — lively & natural!)
    const simDt = realDt * effectiveSpeed;
    const prevHour = this.simHour;
    this.simHour += realDt * effectiveSpeed * 0.022;

    // Roll over midnight -> next morning smoothly (fast-forward dead of night 23:00 -> 06:30 if running continuously)
    if (this.simHour >= 24.0) {
      this.simHour -= 24.0;
      this.dayIndex++;
      for (const w of this.workers) {
        w.hasArrivedToday = false;
        w.hasHadLunchToday = false;
      }
      this.logEvent(`📅 New workday started — ${this.getWeekdayName()}`);
    } else if (prevHour < 6.5 && this.simHour >= 6.5) {
      for (const w of this.workers) {
        w.hasArrivedToday = false;
        w.hasHadLunchToday = false;
      }
    }

    // 1. Update Outdoor Sky, Sun, Traffic & Fountain
    const { nightFactor } = this.outdoor.update(
      this.paused ? 0 : realDt * Math.min(effectiveSpeed, 4),
      this.simHour,
      elapsedReal
    );

    // 2. Schedule Arrivals, Lunches, Meetings, Micro-Behaviors & Departures
    if (!this.paused && simDt > 0) {
      this._updateDailySchedules(simDt);
      this._updateActiveMeetings(simDt);
    }

    // 3. Update Elevator Group Controller & Cab Physics
    this.elevators.update(simDt, this.simHour);

    // 4. Update All Workers
    let someoneNearFrontDoors = false;
    for (const w of this.workers) {
      w.update(simDt, this.workers, this.building.isolatedFloor, this.showActivityBubbles);
      if (w.state !== 'OFFSITE' && w.floor === 0 && Math.abs(w.x) < 3.5 && Math.abs(w.z - 11.0) < 3.4) {
        someoneNearFrontDoors = true;
      }
    }

    // 5. Update Building Doors, Interior Lights & Server Rack LEDs
    this.building.update(realDt, nightFactor, elapsedReal, someoneNearFrontDoors);
  }

  _updateDailySchedules(simDt) {
    const h = this.simHour;

    for (const w of this.workers) {
      // Morning Arrival Trigger
      if (!w.hasArrivedToday && h >= w.profile.arrivalHour && h < w.profile.departureHour - 0.5) {
        w.hasArrivedToday = true;
        w.floor = 0;
        w.y = 0;
        w.x = w.spawnSide * (30 + (w.id % 5) * 2.4);
        w.z = 28.4 + (w.id % 3) * 0.4;
        w.mesh.visible = true;
        w.returnToHomeStation();
        w.setBadge('🚶', `Arriving → F${w.profile.homeFloor}`, '#1e3a8a');
      }

      // Midday Lunch Trigger
      if (
        w.inBuilding &&
        !w.hasHadLunchToday &&
        h >= w.profile.lunchHour &&
        h < 13.6 &&
        w.isAvailableForSocialOrMeeting()
      ) {
        w.hasHadLunchToday = true;
        this._sendWorkerToLunch(w);
      }

      // Evening Departure Trigger
      if (
        w.inBuilding &&
        h >= w.profile.departureHour &&
        w.state !== 'WALKING_FLOOR' &&
        !w.isBusyInTransit() &&
        (!w.goal || w.goal.arrivalState !== 'DEPARTED_OFFSITE')
      ) {
        this._sendWorkerHome(w);
      }
    }

    // Periodic Multi-Floor Scheduled Meetings during core work hours (08:40 - 16:40)
    if (h >= 8.6 && h <= 16.6) {
      this.autoMeetingCooldown -= simDt;
      if (this.autoMeetingCooldown <= 0) {
        this.triggerTeamMeeting();
        this.autoMeetingCooldown = 34 + Math.random() * 18;
      }
    }

    // Spontaneous Micro-Behaviors (Coffee runs, Watercooler chats, Peer collab, Phone calls)
    if (h >= 8.4 && h <= 17.2) {
      this.microBehaviorCooldown -= simDt;
      if (this.microBehaviorCooldown <= 0) {
        this.microBehaviorCooldown = 4.2 + Math.random() * 3.5;
        const roll = Math.random();
        if (roll < 0.34) {
          const candidates = this.workers.filter(w => w.isAvailableForSocialOrMeeting() && !w.hasCoffee);
          if (candidates.length > 0) {
            const pick = candidates.sort((a, b) => a.energy - b.energy)[0];
            this._sendWorkerForCoffee(pick);
          }
        } else if (roll < 0.60) {
          this._triggerWatercoolerChat();
        } else if (roll < 0.82) {
          this._triggerPeerDeskVisit();
        } else {
          this._triggerPhoneCall();
        }
      }
    }
  }

  _updateActiveMeetings(simDt) {
    for (let i = this.activeMeetings.length - 1; i >= 0; i--) {
      const m = this.activeMeetings[i];
      m.remainingSec -= simDt;
      if (m.remainingSec <= 0) {
        m.room.activeMeeting = null;
        m.room.screenMat.emissiveIntensity = 0.08;
        for (const attendee of m.attendees) {
          if (attendee.inBuilding && (attendee.state === 'IN_MEETING' || (attendee.goal && attendee.goal.arrivalState === 'IN_MEETING'))) {
            attendee.returnToHomeStation();
          }
        }
        this.logEvent(`✅ Wrapped "${m.title}" in ${m.room.name}.`);
        this.activeMeetings.splice(i, 1);
      }
    }
  }

  getOfficeMetrics() {
    let inside = 0;
    let atDesk = 0;
    let inMeetings = 0;
    let elevatorOrStairs = 0;
    let socialOrBreak = 0;

    for (const w of this.workers) {
      if (w.state === 'OFFSITE') continue;
      if (w.inBuilding) inside++;
      if (w.state === 'DESK_WORK' || w.state === 'RECEPTION_DUTY' || w.state === 'BARISTA_DUTY') {
        atDesk++;
      } else if (w.state === 'IN_MEETING' || (w.goal && w.goal.arrivalState === 'IN_MEETING')) {
        inMeetings++;
      } else if (
        w.state === 'WAITING_ELEVATOR' ||
        w.state === 'ELEVATOR_BOARDING' ||
        w.state === 'ELEVATOR_RIDING' ||
        w.state === 'ELEVATOR_EXITING' ||
        w.state === 'CLIMBING_STAIRS'
      ) {
        elevatorOrStairs++;
      } else if (
        w.state === 'GETTING_COFFEE' ||
        w.state === 'SOCIALIZING' ||
        w.state === 'PEER_COLLAB' ||
        w.state === 'LUNCH' ||
        w.state === 'LOUNGE_BREAK' ||
        w.state === 'PHONE_CALL'
      ) {
        socialOrBreak++;
      }
    }

    return { inside, total: this.workers.length, atDesk, inMeetings, elevatorOrStairs, socialOrBreak };
  }
}
