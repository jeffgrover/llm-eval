(function () {
  'use strict';

  var OfficeSim = (window.OfficeSim = window.OfficeSim || {});

  OfficeSim.CONFIG = {
    // Building geometry (meters)
    BUILDING_WIDTH: 28,
    BUILDING_DEPTH: 18,
    FLOOR_HEIGHT: 4.0,
    SLAB_THICKNESS: 0.28,
    FLOOR_COUNT: 6, // 0..5 interior floors; 6 is rooftop terrace
    ROOF_FLOOR: 6,

    // Elevator shafts (2 independent cars)
    ELEVATOR_X: [-2.2, 2.2],
    ELEVATOR_Z: -6.6,
    ELEVATOR_WIDTH: 2.3,
    ELEVATOR_DEPTH: 2.3,
    ELEVATOR_DOOR_Z: -5.45,
    ELEVATOR_WAIT_Z: -4.2,
    ELEVATOR_CAPACITY: 6,
    ELEVATOR_MAX_SPEED: 4.2, // m/s (~1.05 floors/sec)
    ELEVATOR_ACCEL: 3.0,     // m/s^2
    ELEVATOR_DOOR_TIME: 0.9, // seconds to open/close
    ELEVATOR_DWELL_MIN: 2.2, // seconds doors stay open

    // Main corridor Z spine on all floors
    CORRIDOR_Z: -3.1,

    // Worker population & speeds
    WORKER_COUNT: 34,
    WORKER_WALK_SPEED: 1.55, // m/s

    // Time: starts at 08:15 AM, 1 real second = 1.5 sim minutes at 1x
    START_HOUR: 8.25,
    SIM_MINUTES_PER_REAL_SEC: 1.5
  };

  OfficeSim.FLOORS = [
    {
      index: 0,
      shortName: 'L',
      name: 'Ground Lobby',
      dept: 'Reception & Arrival',
      accent: '#38bdf8',
      floorStyle: 'terrazzo'
    },
    {
      index: 1,
      shortName: '1F',
      name: 'Café & Commons',
      dept: 'Dining & Lounge',
      accent: '#f59e0b',
      floorStyle: 'wood'
    },
    {
      index: 2,
      shortName: '2F',
      name: 'Engineering',
      dept: 'Engineering & Product',
      accent: '#34d399',
      floorStyle: 'carpet_slate'
    },
    {
      index: 3,
      shortName: '3F',
      name: 'Design Studio',
      dept: 'Design & Creative',
      accent: '#a78bfa',
      floorStyle: 'wood_light'
    },
    {
      index: 4,
      shortName: '4F',
      name: 'Operations & Sales',
      dept: 'Operations & Sales',
      accent: '#fb7185',
      floorStyle: 'carpet_warm'
    },
    {
      index: 5,
      shortName: '5F',
      name: 'Executive Suite',
      dept: 'Executive & Strategy',
      accent: '#fbbf24',
      floorStyle: 'carpet_navy'
    },
    {
      index: 6,
      shortName: 'RF',
      name: 'Rooftop Terrace',
      dept: 'Sky Garden & Lounge',
      accent: '#4ade80',
      floorStyle: 'deck'
    }
  ];

  OfficeSim.CAMERA_PRESETS = {
    hero: {
      pos: [34, 24, 38],
      target: [0, 11, 0]
    },
    cutaway: {
      pos: [24, 18, 30],
      target: [0, 11, -1]
    },
    lobby: {
      pos: [12, 5.5, 20],
      target: [0, 2.2, 1]
    },
    shafts: {
      pos: [8, 14, 8],
      target: [0, 11, -6.5]
    },
    rooftop: {
      pos: [19, 31, 18],
      target: [0, 24.5, 0]
    },
    street: {
      pos: [-28, 7.5, 34],
      target: [0, 10, 0]
    }
  };

  OfficeSim.WORKER_PROFILES = {
    firstNames: [
      'Maya', 'Liam', 'Sophia', 'Noah', 'Elena', 'Marcus', 'Chloe', 'Aiden',
      'Priya', 'Lucas', 'Hannah', 'Daniel', 'Amara', 'Ethan', 'Zoe', 'Kenji',
      'Nora', 'Gabriel', 'Freya', 'Mateo', 'Clara', 'Owen', 'Yuki', 'Samir',
      'Isla', 'Julian', 'Leila', 'Caleb', 'Sienna', 'Victor', 'Tessa', 'Rohan',
      'Eva', 'Theo', 'Mina', 'Leo', 'Grace', 'Devon'
    ],
    lastNames: [
      'Chen', 'Patel', 'Rivera', 'Kim', 'Okafor', 'Lindqvist', 'Morales', 'Brooks',
      'Sato', 'Bennett', 'Kowalski', 'Alvarez', 'Singh', 'Harper', 'Nakamura', 'Vance',
      'Rossi', 'Foster', 'Cho', 'Delgado', 'Walsh', 'Bhatia', 'Jensen', 'Carter'
    ],
    rolesByFloor: {
      0: ['Front Desk Concierge', 'Workplace Coordinator'],
      1: ['Head Barista', 'Hospitality Lead'],
      2: ['Staff Engineer', 'Frontend Engineer', 'Systems Architect', 'Product Manager', 'ML Engineer', 'QA Lead', 'DevOps Engineer'],
      3: ['Design Director', 'Product Designer', 'Brand Strategist', 'UX Researcher', 'Motion Designer', 'Creative Lead'],
      4: ['Account Executive', 'Operations Manager', 'Solutions Architect', 'Customer Success', 'Sales Director', 'RevOps Analyst'],
      5: ['Chief Executive Officer', 'VP of Strategy', 'Chief Operating Officer', 'VP of Finance']
    },
    skinTones: [0xf5d0b5, 0xe8b896, 0xd49a73, 0xb67850, 0x8d5524, 0x6b3e26],
    hairColors: [0x1a1412, 0x3b271c, 0x6b4423, 0xa87c4f, 0xd4b27c, 0x8c3b2b, 0x555b66],
    outfitColors: [
      0x1e3a5f, 0x334155, 0x475569, 0x0f766e, 0x7c2d12, 0x4c1d95,
      0x1e293b, 0x9f1239, 0x166534, 0x854d0e, 0x3730a3, 0x3f6212,
      0x64748b, 0x2563eb, 0xb45309, 0x6d28d9
    ],
    pantsColors: [0x1e293b, 0x27272a, 0x334155, 0x3f3f46, 0x44403c, 0x172554]
  };

  // Utility helpers
  OfficeSim.Utils = {
    clamp: function (v, lo, hi) {
      return Math.max(lo, Math.min(hi, v));
    },
    lerp: function (a, b, t) {
      return a + (b - a) * t;
    },
    rand: function (min, max) {
      return min + Math.random() * (max - min);
    },
    pick: function (arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    },
    formatTime: function (hoursFloat) {
      var h = Math.floor(hoursFloat) % 24;
      var m = Math.floor((hoursFloat - Math.floor(hoursFloat)) * 60);
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    },
    floorToY: function (floorIndex) {
      return floorIndex * OfficeSim.CONFIG.FLOOR_HEIGHT;
    },
    yToFloor: function (y) {
      return Math.round(y / OfficeSim.CONFIG.FLOOR_HEIGHT);
    }
  };
})();
