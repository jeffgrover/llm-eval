import * as THREE from 'three';
import { BUILDING } from './config.js';
import { createActivityBadgeTexture } from './textures.js';

const SHARED_GEOS = {
  head: new THREE.SphereGeometry(0.115, 14, 12),
  eye: new THREE.SphereGeometry(0.016, 6, 6),
  torso: new THREE.BoxGeometry(0.32, 0.42, 0.19),
  pelvis: new THREE.BoxGeometry(0.30, 0.14, 0.18),
  upperArm: new THREE.CapsuleGeometry(0.045, 0.19, 4, 8),
  foreArm: new THREE.CapsuleGeometry(0.038, 0.18, 4, 8),
  thigh: new THREE.CapsuleGeometry(0.058, 0.28, 4, 8),
  shin: new THREE.CapsuleGeometry(0.048, 0.28, 4, 8),
  shoe: new THREE.BoxGeometry(0.10, 0.065, 0.19),
  badge: new THREE.BoxGeometry(0.065, 0.085, 0.01),
  cup: new THREE.CylinderGeometry(0.036, 0.028, 0.095, 10),
  phone: new THREE.BoxGeometry(0.04, 0.08, 0.01)
};

// Cache activity badge textures by key so we never recreate canvases unnecessarily
const BADGE_TEX_CACHE = new Map();
function getBadgeTex(emoji, text, bg) {
  const key = `${emoji}|${text}|${bg}`;
  if (!BADGE_TEX_CACHE.has(key)) {
    BADGE_TEX_CACHE.set(key, createActivityBadgeTexture(emoji, text, bg));
  }
  return BADGE_TEX_CACHE.get(key);
}

export class Worker {
  constructor(profile, scene, navigator, elevatorSystem, building) {
    this.profile = profile;
    this.id = profile.id;
    this.name = profile.name;
    this.scene = scene;
    this.navigator = navigator;
    this.elevators = elevatorSystem;
    this.building = building;

    // Spatial state (starts off-site on the street before morning arrival)
    this.inBuilding = false;
    this.hasArrivedToday = false;
    this.hasHadLunchToday = false;
    this.floor = 0;
    this.spawnSide = this.id % 2 === 0 ? -1 : 1;
    this.x = this.spawnSide * (32 + (this.id % 7) * 3.2);
    this.y = 0;
    this.z = 28.5 + (this.id % 3) * 0.45;
    this.heading = this.spawnSide < 0 ? Math.PI / 2 : -Math.PI / 2;

    // Navigation & state machine
    this.state = 'OFFSITE';
    this.activityLabel = 'Commuting';
    this.activityEmoji = '🚶';
    this.waypoints = [];
    this.stairPoints3D = [];
    this.currentGate = null; // doorway gate of room currently occupied, if any
    this.homeDesk = null;
    this.heldSeat = null;
    this.heldBooth = null;
    this.goal = null;
    this.pendingGoal = null;
    this.partner = null;

    // Elevator transit state
    this.elevatorCar = null;
    this.elevatorSlot = null;
    this.elevatorDestFloor = null;
    this.waitSlot = null;
    this.waitElapsed = 0;
    this.exitDelay = 0;

    // Internal timers & needs
    this.stateTimer = 0;
    this.walkCycle = (this.id * 1.7) % (Math.PI * 2);
    this.hasCoffee = false;
    this.coffeeTimer = 0;
    this.energy = 0.78 + (this.id % 5) * 0.04;
    this.focus = 0.85;
    this.selected = false;
    this.showBubble = true;

    this._buildCharacterRig();
    this.mesh.visible = false; // hidden until morning commute begins
  }

  _buildCharacterRig() {
    this.mesh = new THREE.Group();
    this.mesh.scale.setScalar(this.profile.heightScale);
    this.mesh.userData.worker = this;

    const skinMat = new THREE.MeshStandardMaterial({ color: this.profile.skinColor, roughness: 0.65 });
    const hairMat = new THREE.MeshStandardMaterial({ color: this.profile.hairColor, roughness: 0.78 });
    const topMat = new THREE.MeshStandardMaterial({ color: this.profile.topColor, roughness: 0.72 });
    const bottomMat = new THREE.MeshStandardMaterial({ color: this.profile.bottomColor, roughness: 0.78 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.55 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });

    // Pelvis root
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.88;
    this.mesh.add(this.pelvis);

    const pelvisMesh = new THREE.Mesh(SHARED_GEOS.pelvis, bottomMat);
    pelvisMesh.castShadow = true;
    this.pelvis.add(pelvisMesh);

    // Torso
    this.torso = new THREE.Group();
    this.torso.position.y = 0.26;
    this.pelvis.add(this.torso);

    const torsoMesh = new THREE.Mesh(SHARED_GEOS.torso, topMat);
    torsoMesh.castShadow = true;
    this.torso.add(torsoMesh);

    // Employee ID Badge on chest
    const badgeMesh = new THREE.Mesh(
      SHARED_GEOS.badge,
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })
    );
    badgeMesh.position.set(0.08, 0.05, 0.10);
    this.torso.add(badgeMesh);

    // Head + Hair + Eyes
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.34;
    this.torso.add(this.headGroup);

    const headMesh = new THREE.Mesh(SHARED_GEOS.head, skinMat);
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    [-0.04, 0.04].forEach(ex => {
      const eye = new THREE.Mesh(SHARED_GEOS.eye, eyeMat);
      eye.position.set(ex, 0.015, 0.103);
      this.headGroup.add(eye);
    });

    // Varied Hairstyles
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.122, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
      hairMat
    );
    hairCap.position.y = 0.01;
    hairCap.rotation.x = -0.18;
    this.headGroup.add(hairCap);

    if (this.profile.hairStyle === 1) {
      // Top bun / chignon
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), hairMat);
      bun.position.set(0, 0.11, -0.07);
      this.headGroup.add(bun);
    } else if (this.profile.hairStyle === 2) {
      // Shoulder-length bob
      const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.12), hairMat);
      backHair.position.set(0, -0.04, -0.05);
      this.headGroup.add(backHair);
    }

    // Left & Right Articulated Arms
    this.leftArmPivot = this._createArm(skinMat, topMat, -0.205, false);
    this.rightArmPivot = this._createArm(skinMat, topMat, 0.205, true);
    this.torso.add(this.leftArmPivot.shoulder);
    this.torso.add(this.rightArmPivot.shoulder);

    // Left & Right Articulated Legs
    this.leftLeg = this._createLeg(bottomMat, shoeMat, -0.095);
    this.rightLeg = this._createLeg(bottomMat, shoeMat, 0.095);
    this.pelvis.add(this.leftLeg.hip);
    this.pelvis.add(this.rightLeg.hip);

    // Selection Highlight Ring on Floor
    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.42, 24),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.02;
    this.selectionRing.visible = false;
    this.mesh.add(this.selectionRing);

    // Floating Activity Status Sprite (above head, togglable)
    const spriteMat = new THREE.SpriteMaterial({
      map: getBadgeTex('💼', 'Working', '#0f172a'),
      transparent: true,
      depthWrite: false
    });
    this.badgeSprite = new THREE.Sprite(spriteMat);
    this.badgeSprite.scale.set(1.25, 0.35, 1);
    this.badgeSprite.position.y = 2.08;
    this.badgeSprite.visible = false;
    this.mesh.add(this.badgeSprite);

    // Invisible click hitbox cylinder so raycasting workers is effortless!
    const hitGeo = new THREE.CylinderGeometry(0.28, 0.28, 1.82, 8);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    this.hitbox = new THREE.Mesh(hitGeo, hitMat);
    this.hitbox.position.y = 0.91;
    this.hitbox.userData.worker = this;
    this.mesh.add(this.hitbox);

    this.scene.add(this.mesh);
  }

  _createArm(skinMat, sleeveMat, offsetX, withProps) {
    const shoulder = new THREE.Group();
    shoulder.position.set(offsetX, 0.17, 0);

    const upper = new THREE.Mesh(SHARED_GEOS.upperArm, sleeveMat);
    upper.position.y = -0.13;
    upper.castShadow = true;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    shoulder.add(elbow);

    const fore = new THREE.Mesh(SHARED_GEOS.foreArm, skinMat);
    fore.position.y = -0.12;
    elbow.add(fore);

    let cup = null;
    let phone = null;
    if (withProps) {
      cup = new THREE.Mesh(
        SHARED_GEOS.cup,
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
      );
      cup.position.set(0, -0.23, 0.05);
      cup.rotation.x = Math.PI / 2;
      cup.visible = false;
      elbow.add(cup);

      phone = new THREE.Mesh(
        SHARED_GEOS.phone,
        new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.2 })
      );
      phone.position.set(0, -0.22, 0.03);
      phone.visible = false;
      elbow.add(phone);
    }

    return { shoulder, elbow, cup, phone };
  }

  _createLeg(pantsMat, shoeMat, offsetX) {
    const hip = new THREE.Group();
    hip.position.set(offsetX, -0.04, 0);

    const thigh = new THREE.Mesh(SHARED_GEOS.thigh, pantsMat);
    thigh.position.y = -0.21;
    thigh.castShadow = true;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);

    const shin = new THREE.Mesh(SHARED_GEOS.shin, pantsMat);
    shin.position.y = -0.20;
    shin.castShadow = true;
    knee.add(shin);

    const shoe = new THREE.Mesh(SHARED_GEOS.shoe, shoeMat);
    shoe.position.set(0, -0.39, 0.035);
    knee.add(shoe);

    return { hip, knee };
  }

  // ==================== Activity & Journey Control ====================

  setBadge(emoji, label, bg = '#0f172a') {
    this.activityEmoji = emoji;
    this.activityLabel = label;
    this.badgeSprite.material.map = getBadgeTex(emoji, label, bg);
    this.badgeSprite.material.needsUpdate = true;
  }

  isBusyInTransit() {
    return (
      this.state === 'ELEVATOR_BOARDING' ||
      this.state === 'ELEVATOR_RIDING' ||
      this.state === 'ELEVATOR_EXITING' ||
      this.state === 'CLIMBING_STAIRS'
    );
  }

  isAvailableForSocialOrMeeting() {
    if (!this.inBuilding || this.profile.isReception || this.profile.isBarista) return false;
    if (this.state === 'DESK_WORK' || this.state === 'LOUNGE_BREAK') return true;
    return false;
  }

  isReadyAtElevatorHall() {
    return this.state === 'WAITING_ELEVATOR';
  }

  canBoardElevatorNow(floor) {
    return (
      this.floor === floor &&
      (this.state === 'WAITING_ELEVATOR' ||
        (this.state === 'WALKING_TO_ELEVATOR' && this.z < -4.2 && Math.abs(this.x) < 5.2))
    );
  }

  _releaseCurrentResources() {
    // Dim home desk monitors when leaving desk
    if (this.homeDesk && this.state === 'DESK_WORK') {
      this.homeDesk.monitorMeshes.forEach(m => { m.mat.emissiveIntensity = 0.08; });
    }
    if (this.heldSeat) {
      if (this.heldSeat.occupiedBy === this) this.heldSeat.occupiedBy = null;
      this.heldSeat = null;
    }
    if (this.heldBooth) {
      if (this.heldBooth.occupiedBy === this) this.heldBooth.occupiedBy = null;
      this.heldBooth = null;
    }
    if (this.partner) {
      const other = this.partner;
      this.partner = null;
      if (other.partner === this) other.partner = null;
    }
    this.elevators.cancelWaiter(this);
  }

  /**
   * Directs the worker to travel to a destination (same floor or any other floor)
   * and perform `arrivalState` for `durationSec`.
   */
  goTo(dest, arrivalState, durationSec = 40, badgeInfo = null) {
    if (this.isBusyInTransit()) {
      this.pendingGoal = { dest, arrivalState, durationSec, badgeInfo };
      return;
    }

    const leavingGate = this.currentGate;
    this._releaseCurrentResources();
    this.currentGate = null;

    this.goal = {
      floor: dest.floor,
      x: dest.x,
      z: dest.z,
      faceX: dest.faceX ?? dest.x,
      faceZ: dest.faceZ ?? (dest.z - 1),
      gate: dest.gate || null,
      seatRef: dest.seatRef || null,
      boothRef: dest.boothRef || null,
      arrivalState,
      durationSec,
      badgeInfo
    };

    if (dest.seatRef) {
      dest.seatRef.occupiedBy = this;
      this.heldSeat = dest.seatRef;
    }
    if (dest.boothRef) {
      dest.boothRef.occupiedBy = this;
      this.heldBooth = dest.boothRef;
    }

    if (badgeInfo) {
      this.setBadge(badgeInfo.emoji, badgeInfo.label, badgeInfo.bg || '#0f172a');
    }

    if (this.floor === dest.floor) {
      this.waypoints = this.navigator.findFloorPath(
        this.floor, this.x, this.z, dest.x, dest.z, leavingGate, dest.gate
      );
      this.state = 'WALKING_FLOOR';
    } else {
      // Inter-floor routing: decide Stairs vs Elevator!
      const floorDelta = Math.abs(dest.floor - this.floor);
      const hallQueueLen = this.elevators.hallWaiters[this.floor].length;
      const takeStairs =
        floorDelta === 1 &&
        (Math.random() < this.profile.stairAffinity || hallQueueLen >= 5);

      if (takeStairs) {
        this.waypoints = this.navigator.findFloorPath(
          this.floor, this.x, this.z, BUILDING.stairEntry.x, BUILDING.stairEntry.z, leavingGate, null
        );
        this.state = 'WALKING_TO_STAIRS';
      } else {
        this.waitSlot = this.elevators.allocateWaitSlot(this.floor, this);
        this.waypoints = this.navigator.findFloorPath(
          this.floor, this.x, this.z, this.waitSlot.x, this.waitSlot.z, leavingGate, null
        );
        this.state = 'WALKING_TO_ELEVATOR';
        this.waitElapsed = 0;
        this.elevators.requestHallCall(this, this.floor, dest.floor);
      }
    }
  }

  // ==================== Elevator Handshake Callbacks ====================

  beginElevatorBoard(car, slotInfo, toFloor) {
    this.elevatorCar = car;
    this.elevatorSlot = slotInfo;
    this.elevatorDestFloor = toFloor;
    this.state = 'ELEVATOR_BOARDING';
    // Step to doorway center first, then into assigned cab slot
    this.waypoints = [
      { x: car.x, z: -6.9 },
      { x: slotInfo.worldX, z: slotInfo.worldZ }
    ];
  }

  beginElevatorExit(car, arrivedFloor, delaySec = 0) {
    this.floor = arrivedFloor;
    this.y = arrivedFloor * BUILDING.floorHeight;
    this.elevatorCar = null;
    this.elevatorSlot = null;
    this.exitDelay = delaySec;
    this.state = 'ELEVATOR_EXITING';
    // Walk straight out into elevator lobby spine
    this.waypoints = [
      { x: car.x, z: -6.5 },
      { x: car.x + (this.id % 3 - 1) * 0.35, z: -4.85 }
    ];
  }

  // ==================== Frame Update & Procedural Kinematics ====================

  update(dt, allWorkers, isolatedFloor, showBubblesGlobal) {
    if (this.state === 'OFFSITE') {
      this.mesh.visible = false;
      return;
    }

    // Hide worker if on a floor above an active floor-isolation slice
    const visibleBySlice = isolatedFloor === null ? true : this.floor <= isolatedFloor;
    this.mesh.visible = visibleBySlice;
    this.selectionRing.visible = this.selected;

    // Show status pill if selected OR global bubbles enabled during notable states
    const notable = this.state !== 'DESK_WORK' || this.selected;
    this.badgeSprite.visible = visibleBySlice && (this.selected || (showBubblesGlobal && notable));

    // Coffee prop decay
    if (this.hasCoffee) {
      this.coffeeTimer -= dt;
      if (this.coffeeTimer <= 0) this.hasCoffee = false;
    }
    if (this.rightArmPivot.cup) {
      this.rightArmPivot.cup.visible = this.hasCoffee && this.state !== 'PHONE_CALL';
    }
    if (this.rightArmPivot.phone) {
      this.rightArmPivot.phone.visible = this.state === 'PHONE_CALL';
    }

    // Track building occupancy flag based on front doors (Z < 11.2)
    this.inBuilding = !(this.floor === 0 && this.z > 11.4);

    // State machine update
    const clampedDt = Math.min(dt, 0.12);

    switch (this.state) {
      case 'WALKING_FLOOR': {
        if (this._followWaypoints2D(clampedDt, allWorkers, 1.52)) {
          this._onReachDestination();
        }
        break;
      }

      case 'WALKING_TO_ELEVATOR': {
        if (this._followWaypoints2D(clampedDt, allWorkers, 1.55)) {
          this.state = 'WAITING_ELEVATOR';
          this.waitElapsed = 0;
          if (this.goal) {
            this.elevators.requestHallCall(this, this.floor, this.goal.floor);
          }
        }
        break;
      }

      case 'WAITING_ELEVATOR': {
        this._faceToward(this.x, -8.2, clampedDt * 6);
        this._applyStandingPose(clampedDt, false);
        this.waitElapsed += clampedDt;

        // Realistic impatience: if waiting > 18s for a 1-floor hop, switch to the stairs!
        if (this.waitElapsed > 18 && this.goal && Math.abs(this.goal.floor - this.floor) === 1) {
          this.elevators.cancelWaiter(this);
          this.waypoints = this.navigator.findFloorPath(
            this.floor, this.x, this.z, BUILDING.stairEntry.x, BUILDING.stairEntry.z
          );
          this.state = 'WALKING_TO_STAIRS';
        }
        break;
      }

      case 'ELEVATOR_BOARDING': {
        if (this.elevatorCar) {
          this.y = this.elevatorCar.y;
        }
        if (this._followWaypoints2D(clampedDt, null, 1.65)) {
          this.state = 'ELEVATOR_RIDING';
        }
        break;
      }

      case 'ELEVATOR_RIDING': {
        if (this.elevatorCar) {
          this.y = this.elevatorCar.y;
          this.floor = this.elevatorCar.currentFloor;
        }
        // Face forward (+Z) out the cab doors while riding!
        this._faceToward(this.x, this.z + 2.0, clampedDt * 7);
        this._applyStandingPose(clampedDt, false);
        break;
      }

      case 'ELEVATOR_EXITING': {
        if (this.exitDelay > 0) {
          this.exitDelay -= clampedDt;
          this._applyStandingPose(clampedDt, false);
          break;
        }
        if (this._followWaypoints2D(clampedDt, null, 1.65)) {
          // Check if a pending goal arrived while we were in the shaft
          if (this.pendingGoal) {
            const pg = this.pendingGoal;
            this.pendingGoal = null;
            this.goTo(pg.dest, pg.arrivalState, pg.durationSec, pg.badgeInfo);
          } else if (this.goal) {
            if (this.floor === this.goal.floor) {
              this.waypoints = this.navigator.findFloorPath(
                this.floor, this.x, this.z, this.goal.x, this.goal.z, null, this.goal.gate
              );
              this.state = 'WALKING_FLOOR';
            } else {
              // Re-route if exited early
              this.goTo(this.goal, this.goal.arrivalState, this.goal.durationSec, this.goal.badgeInfo);
            }
          }
        }
        break;
      }

      case 'WALKING_TO_STAIRS': {
        if (this._followWaypoints2D(clampedDt, allWorkers, 1.55)) {
          const targetF = this.goal ? this.goal.floor : this.profile.homeFloor;
          this.stairPoints3D = this.navigator.getStairPath3D(this.floor, targetF);
          this.state = 'CLIMBING_STAIRS';
          this.setBadge('🪜', targetF > this.floor ? `Stairs → F${targetF}` : `Stairs → F${targetF}`, '#1e293b');
        }
        break;
      }

      case 'CLIMBING_STAIRS': {
        if (this._followStairs3D(clampedDt, 1.48)) {
          const destF = this.goal ? this.goal.floor : this.floor;
          this.floor = destF;
          this.y = destF * BUILDING.floorHeight;

          if (this.pendingGoal) {
            const pg = this.pendingGoal;
            this.pendingGoal = null;
            this.goTo(pg.dest, pg.arrivalState, pg.durationSec, pg.badgeInfo);
          } else if (this.goal) {
            if (this.goal.badgeInfo) {
              this.setBadge(this.goal.badgeInfo.emoji, this.goal.badgeInfo.label, this.goal.badgeInfo.bg);
            }
            this.waypoints = this.navigator.findFloorPath(
              this.floor, this.x, this.z, this.goal.x, this.goal.z, null, this.goal.gate
            );
            this.state = 'WALKING_FLOOR';
          }
        }
        break;
      }

      case 'DESK_WORK': {
        this.y = this.floor * BUILDING.floorHeight;
        if (this.homeDesk) {
          this._faceToward(this.homeDesk.faceX, this.homeDesk.faceZ, clampedDt * 8);
          this.homeDesk.monitorMeshes.forEach(m => { m.mat.emissiveIntensity = 0.95; });
        }
        this._applySeatedPose(clampedDt, true);
        this.energy = Math.max(0.15, this.energy - clampedDt * 0.0022);
        break;
      }

      case 'RECEPTION_DUTY':
      case 'BARISTA_DUTY': {
        this.y = 0;
        const spot = this.state === 'RECEPTION_DUTY' ? this.building.receptionSpot : this.building.baristaSpot;
        if (spot) {
          this._faceToward(spot.faceX, spot.faceZ, clampedDt * 6);
          spot.monitorMeshes.forEach(m => { m.mat.emissiveIntensity = 0.9; });
        }
        this._applyStandingPose(clampedDt, true);
        break;
      }

      case 'IN_MEETING': {
        this.y = this.floor * BUILDING.floorHeight;
        if (this.goal) {
          this._faceToward(this.goal.faceX, this.goal.faceZ, clampedDt * 7);
        }
        this._applySeatedPose(clampedDt, false);
        break;
      }

      case 'GETTING_COFFEE': {
        this.y = this.floor * BUILDING.floorHeight;
        if (this.goal) this._faceToward(this.goal.faceX, this.goal.faceZ, clampedDt * 7);
        this._applyStandingPose(clampedDt, true);
        this.stateTimer -= clampedDt;
        if (this.stateTimer <= 0) {
          this.hasCoffee = true;
          this.coffeeTimer = 95;
          this.energy = Math.min(1.0, this.energy + 0.42);
          this.returnToHomeStation();
        }
        break;
      }

      case 'SOCIALIZING':
      case 'PEER_COLLAB': {
        this.y = this.floor * BUILDING.floorHeight;
        if (this.partner) {
          this._faceToward(this.partner.x, this.partner.z, clampedDt * 7);
        } else if (this.goal) {
          this._faceToward(this.goal.faceX, this.goal.faceZ, clampedDt * 7);
        }
        this._applyStandingPose(clampedDt, true);
        this.stateTimer -= clampedDt;
        if (this.stateTimer <= 0) {
          this.returnToHomeStation();
        }
        break;
      }

      case 'PHONE_CALL': {
        this.y = this.floor * BUILDING.floorHeight;
        if (this.goal) this._faceToward(this.goal.faceX, this.goal.faceZ, clampedDt * 7);
        this._applyPhonePose(clampedDt);
        this.stateTimer -= clampedDt;
        if (this.stateTimer <= 0) {
          this.returnToHomeStation();
        }
        break;
      }

      case 'LUNCH':
      case 'LOUNGE_BREAK': {
        this.y = this.floor * BUILDING.floorHeight;
        if (this.goal) this._faceToward(this.goal.faceX, this.goal.faceZ, clampedDt * 7);
        this._applySeatedPose(clampedDt, false);
        this.stateTimer -= clampedDt;
        if (this.stateTimer <= 0) {
          this.energy = Math.min(1.0, this.energy + 0.45);
          this.returnToHomeStation();
        }
        break;
      }
    }

    // Sync Three.js root transform
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
  }

  _onReachDestination() {
    if (!this.goal) return;
    this.currentGate = this.goal.gate || null;
    this.state = this.goal.arrivalState;
    this.stateTimer = this.goal.durationSec || 30;

    if (this.state === 'DEPARTED_OFFSITE') {
      this._releaseCurrentResources();
      this.inBuilding = false;
      this.state = 'OFFSITE';
      this.mesh.visible = false;
      return;
    }

    if (this.state === 'DESK_WORK') {
      this.setBadge('💻', 'Focused Work', '#0f172a');
    } else if (this.state === 'RECEPTION_DUTY') {
      this.setBadge('🛎️', 'Concierge', '#0f172a');
    } else if (this.state === 'BARISTA_DUTY') {
      this.setBadge('☕', 'Espresso Bar', '#451a03');
    }
  }

  returnToHomeStation() {
    if (this.profile.isReception && this.building.receptionSpot) {
      this.goTo(this.building.receptionSpot, 'RECEPTION_DUTY', 9999, {
        emoji: '🛎️', label: 'Concierge', bg: '#0f172a'
      });
      return;
    }
    if (this.profile.isBarista && this.building.baristaSpot) {
      this.goTo(this.building.baristaSpot, 'BARISTA_DUTY', 9999, {
        emoji: '☕', label: 'Barista', bg: '#451a03'
      });
      return;
    }
    if (this.homeDesk) {
      this.goTo(this.homeDesk, 'DESK_WORK', 9999, {
        emoji: '💻', label: `To F${this.homeDesk.floor} Desk`, bg: '#0f172a'
      });
    }
  }

  // ==================== Locomotion & Limb Kinematics ====================

  _followWaypoints2D(dt, allWorkers, speed) {
    if (!this.waypoints || this.waypoints.length === 0) return true;

    const target = this.waypoints[0];
    let dx = target.x - this.x;
    let dz = target.z - this.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.14) {
      this.x = target.x;
      this.z = target.z;
      this.waypoints.shift();
      return this.waypoints.length === 0;
    }

    let vx = dx / dist;
    let vz = dz / dist;

    // Polite personal-space avoidance along open corridors (disabled on final seat approach)
    if (allWorkers && (this.waypoints.length > 1 || dist > 0.9)) {
      let sepX = 0;
      let sepZ = 0;
      for (const other of allWorkers) {
        if (other === this || other.floor !== this.floor || other.state === 'OFFSITE') continue;
        if (other.state === 'ELEVATOR_RIDING' || other.state === 'DESK_WORK' || other.state === 'IN_MEETING') continue;
        const ox = this.x - other.x;
        const oz = this.z - other.z;
        const d2 = ox * ox + oz * oz;
        if (d2 > 0.001 && d2 < 0.58) {
          const d = Math.sqrt(d2);
          const push = (0.76 - d) * 0.85;
          sepX += (ox / d) * push;
          sepZ += (oz / d) * push;
        }
      }
      vx += sepX;
      vz += sepZ;
      const vLen = Math.hypot(vx, vz) || 1;
      vx /= vLen;
      vz /= vLen;
    }

    const step = Math.min(dist, speed * dt);
    this.x += vx * step;
    this.z += vz * step;
    if (this.state !== 'ELEVATOR_BOARDING') {
      this.y = this.floor * BUILDING.floorHeight;
    }

    this._faceToward(this.x + vx, this.z + vz, dt * 10);
    this._applyWalkingPose(dt, speed);
    return false;
  }

  _followStairs3D(dt, speed) {
    if (!this.stairPoints3D || this.stairPoints3D.length === 0) return true;
    const target = this.stairPoints3D[0];
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dz = target.z - this.z;
    const dist = Math.hypot(dx, dy, dz);

    if (dist < 0.14) {
      this.x = target.x;
      this.y = target.y;
      this.z = target.z;
      this.floor = Math.round(this.y / BUILDING.floorHeight);
      this.stairPoints3D.shift();
      return this.stairPoints3D.length === 0;
    }

    const step = Math.min(dist, speed * dt);
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    this.z += (dz / dist) * step;

    this._faceToward(this.x + dx, this.z + dz, dt * 11);
    this._applyWalkingPose(dt, speed * 1.25);
    return false;
  }

  _faceToward(tx, tz, rate) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    if (dx * dx + dz * dz < 0.0004) return;
    const desired = Math.atan2(dx, dz);
    let diff = desired - this.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += diff * Math.min(1, rate);
  }

  _applyWalkingPose(dt, speed) {
    this.walkCycle += dt * speed * 4.4;
    const s = Math.sin(this.walkCycle);
    const c = Math.cos(this.walkCycle);

    // Subtle stride pelvis bounce
    this.pelvis.position.y = 0.88 + Math.abs(c) * 0.025;
    this.torso.rotation.x = 0.04;
    this.torso.rotation.y = s * 0.06;

    // Legs counter-swing with realistic knee flexion on back-to-front swing
    this.leftLeg.hip.rotation.x = -s * 0.52;
    this.rightLeg.hip.rotation.x = s * 0.52;
    this.leftLeg.knee.rotation.x = Math.max(0, s) * 0.55;
    this.rightLeg.knee.rotation.x = Math.max(0, -s) * 0.55;

    // Arms counter-swing (or steady carry if holding hot coffee!)
    this.leftArmPivot.shoulder.rotation.x = s * 0.42;
    this.leftArmPivot.elbow.rotation.x = -0.22 - Math.max(0, -s) * 0.2;

    if (this.hasCoffee) {
      this.rightArmPivot.shoulder.rotation.x = -0.45;
      this.rightArmPivot.elbow.rotation.x = -0.85;
    } else {
      this.rightArmPivot.shoulder.rotation.x = -s * 0.42;
      this.rightArmPivot.elbow.rotation.x = -0.22 - Math.max(0, s) * 0.2;
    }

    this.headGroup.rotation.y *= 0.85;
    this.headGroup.rotation.x = 0;
  }

  _applyStandingPose(dt, expressive) {
    this.walkCycle += dt * 2.6;
    this.pelvis.position.y = 0.88;
    this.torso.rotation.set(0, 0, 0);
    this.leftLeg.hip.rotation.x = 0;
    this.rightLeg.hip.rotation.x = 0;
    this.leftLeg.knee.rotation.x = 0;
    this.rightLeg.knee.rotation.x = 0;

    if (expressive) {
      // Conversing / gesturing naturally
      const g1 = Math.sin(this.walkCycle * 1.2);
      const g2 = Math.cos(this.walkCycle * 0.9);
      this.leftArmPivot.shoulder.rotation.x = -0.35 + g1 * 0.18;
      this.leftArmPivot.elbow.rotation.x = -0.65 + g2 * 0.2;
      this.rightArmPivot.shoulder.rotation.x = this.hasCoffee ? -0.48 : (-0.3 + g2 * 0.18);
      this.rightArmPivot.elbow.rotation.x = this.hasCoffee ? -0.88 : (-0.6 - g1 * 0.2);
      this.headGroup.rotation.y = g2 * 0.14;
      this.headGroup.rotation.x = g1 * 0.06;
    } else {
      this.leftArmPivot.shoulder.rotation.x = 0.03;
      this.leftArmPivot.elbow.rotation.x = -0.12;
      this.rightArmPivot.shoulder.rotation.x = this.hasCoffee ? -0.45 : 0.03;
      this.rightArmPivot.elbow.rotation.x = this.hasCoffee ? -0.85 : -0.12;
      this.headGroup.rotation.set(0, Math.sin(this.walkCycle * 0.4) * 0.08, 0);
    }
  }

  _applySeatedPose(dt, isTyping) {
    this.walkCycle += dt * (isTyping ? 8.5 : 2.2);
    // Seated pelvis height aligns cleanly with 0.46m chair seat!
    this.pelvis.position.y = 0.51;
    this.torso.rotation.x = isTyping ? 0.08 : 0.02;
    this.torso.rotation.y = 0;

    // Thighs horizontal forward (-PI/2), knees bent 90 deg straight down (+PI/2)
    this.leftLeg.hip.rotation.x = -Math.PI / 2;
    this.rightLeg.hip.rotation.x = -Math.PI / 2;
    this.leftLeg.knee.rotation.x = Math.PI / 2;
    this.rightLeg.knee.rotation.x = Math.PI / 2;

    if (isTyping) {
      const t1 = Math.sin(this.walkCycle) * 0.06;
      const t2 = Math.cos(this.walkCycle * 1.13) * 0.06;
      this.leftArmPivot.shoulder.rotation.x = -0.62 + t1;
      this.leftArmPivot.elbow.rotation.x = -0.82 - t1;
      this.rightArmPivot.shoulder.rotation.x = -0.62 + t2;
      this.rightArmPivot.elbow.rotation.x = -0.82 - t2;
      // Subtle gaze scan between dual monitors!
      this.headGroup.rotation.y = Math.sin(this.walkCycle * 0.14) * 0.18;
      this.headGroup.rotation.x = 0.05;
    } else {
      // Seated in meeting / café / lounge
      const g = Math.sin(this.walkCycle * 0.8);
      this.leftArmPivot.shoulder.rotation.x = -0.35 + g * 0.08;
      this.leftArmPivot.elbow.rotation.x = -0.75;
      this.rightArmPivot.shoulder.rotation.x = -0.35 - g * 0.08;
      this.rightArmPivot.elbow.rotation.x = -0.75;
      this.headGroup.rotation.y = Math.cos(this.walkCycle * 0.55) * 0.16;
      this.headGroup.rotation.x = g * 0.05;
    }
  }

  _applyPhonePose(dt) {
    this.walkCycle += dt * 2.4;
    this.pelvis.position.y = 0.88;
    this.leftLeg.hip.rotation.x = 0;
    this.rightLeg.hip.rotation.x = 0;
    this.leftLeg.knee.rotation.x = 0;
    this.rightLeg.knee.rotation.x = 0;

    // Right hand holding phone to ear, left hand expressive gesture
    this.rightArmPivot.shoulder.rotation.x = -1.15;
    this.rightArmPivot.elbow.rotation.x = -1.35;
    this.leftArmPivot.shoulder.rotation.x = -0.25 + Math.sin(this.walkCycle) * 0.12;
    this.leftArmPivot.elbow.rotation.x = -0.5;
    this.headGroup.rotation.z = 0.06;
    this.headGroup.rotation.y = Math.sin(this.walkCycle * 0.6) * 0.12;
  }
}
