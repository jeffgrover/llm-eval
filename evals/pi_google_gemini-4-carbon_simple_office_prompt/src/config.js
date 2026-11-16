// Architectural, schedule, and inhabitant configuration for the Office Simulation

export const BUILDING = {
  width: 36,          // X: -18 to +18
  depth: 22,          // Z: -11 to +11
  halfW: 18,
  halfD: 11,
  floorHeight: 4.2,
  slabThickness: 0.26,
  numFloors: 5,       // 0: Lobby, 1: Design, 2: Engineering, 3: Executive, 4: Roof Cafe & Sky Terrace
  coreHole: {         // Opening in floors 1..4 for 3 elevator shafts + scissor stairwell
    x0: -8.15,
    x1: 4.75,
    z0: -9.85,
    z1: -6.55
  },
  elevatorShaftsX: [-3.2, 0.0, 3.2],
  elevatorZ: -8.45,
  elevatorDoorZ: -7.42,
  stairEntry: { x: -6.5, z: -6.35 }
};

export const FLOORS_INFO = [
  { index: 0, name: 'Ground Atrium & Lobby', short: 'G', dept: 'Reception & Espresso Bar', accent: '#d4a373' },
  { index: 1, name: 'Product & Design Studio', short: 'F1', dept: 'Product & UX Design', accent: '#38bdf8' },
  { index: 2, name: 'Engineering & Cloud Ops', short: 'F2', dept: 'Core Engineering', accent: '#818cf8' },
  { index: 3, name: 'Executive & Strategy', short: 'F3', dept: 'Leadership & Revenue', accent: '#c084fc' },
  { index: 4, name: 'Penthouse Café & Sky Deck', short: 'F4', dept: 'Dining & Rooftop Terrace', accent: '#34d399' }
];

export const MEETING_TEMPLATES = [
  { title: 'Product & UX Design Critique', preferredFloor: 1, minAttendees: 4, maxAttendees: 6, durationMin: 38 },
  { title: 'Cloud Architecture Sync', preferredFloor: 2, minAttendees: 5, maxAttendees: 7, durationMin: 42 },
  { title: 'Sprint Planning & Standup', preferredFloor: 2, minAttendees: 4, maxAttendees: 6, durationMin: 30 },
  { title: 'Executive Q3 Roadmap Review', preferredFloor: 3, minAttendees: 5, maxAttendees: 8, durationMin: 45 },
  { title: 'Cross-Team Launch Readiness', preferredFloor: 3, minAttendees: 5, maxAttendees: 7, durationMin: 40 },
  { title: 'Mobile UI Prototype Huddle', preferredFloor: 1, minAttendees: 3, maxAttendees: 5, durationMin: 32 }
];

export const CHAT_TOPICS = [
  'discussing API latency',
  'reviewing Figma components',
  'catching up over espresso',
  'debating Q3 feature scope',
  'sharing weekend plans',
  'debugging deployment pipeline',
  'planning team lunch',
  'brainstorming onboarding flow'
];

const FIRST_NAMES = [
  'Maya', 'Liam', 'Elena', 'Marcus', 'Chloe', 'Devon', 'Sofia', 'Noah',
  'Priya', 'Julian', 'Hannah', 'Kenji', 'Amara', 'Lucas', 'Zoe', 'Mateo',
  'Nadia', 'Owen', 'Camila', 'Ethan', 'Iris', 'tariq', 'Clara', 'Gabriel',
  'Tessa', 'Victor', 'Leila', 'Samir', 'Audrey', 'Daniel', 'Sienna', 'felix',
  'Rachel', 'Arthur'
].map(n => n.charAt(0).toUpperCase() + n.slice(1));

const LAST_NAMES = [
  'Chen', 'Patel', 'Rostova', 'Vance', 'Kowalski', 'Brooks', 'Alvarez', 'Kim',
  'Nair', 'Mercer', 'Lindqvist', 'Takahashi', 'Okafor', 'Moreau', 'Bennett', 'Silva',
  'Haddad', 'Gallagher', 'Reyes', 'choi', 'Novak', 'Mansour', 'Sinclair', 'Costa',
  'Keller', 'Sterling', 'Farah', 'kapoor', 'Beaumont', 'Park', 'Walsh', 'Berger',
  'Goldman', 'Pendleton'
].map(n => n.charAt(0).toUpperCase() + n.slice(1));

const SKIN_TONES = [
  0xf5d0b5, 0xe8b896, 0xd49b72, 0xb87a52, 0x8d5534, 0x613922, 0xf2ccb7, 0xc68b63
];

const HAIR_COLORS = [
  0x1c1917, 0x3b2618, 0x5c3a21, 0x8c5828, 0xb88648, 0x27272a, 0x6b2d1f, 0x71717a
];

const TOP_PALETTES = [
  { top: 0x2563eb, bottom: 0x1e293b }, // Cobalt shirt, slate slacks
  { top: 0xf8fafc, bottom: 0x334155 }, // Crisp white button-down, charcoal
  { top: 0x0f766e, bottom: 0x1e293b }, // Teal knit, dark navy
  { top: 0x7c3aed, bottom: 0x27272a }, // Violet sweater, black trousers
  { top: 0xe11d48, bottom: 0x1f2937 }, // Crimson blouse, charcoal
  { top: 0x1e3a8a, bottom: 0x94a3b8 }, // Navy blazer, light grey chinos
  { top: 0x0284c7, bottom: 0x1e293b }, // Sky Oxford, dark slacks
  { top: 0xd97706, bottom: 0x292524 }, // Ochre sweater, espresso slacks
  { top: 0x334155, bottom: 0x0f172a }, // Charcoal suit
  { top: 0x059669, bottom: 0x1e293b }, // Emerald top, navy trousers
  { top: 0x4f46e5, bottom: 0x334155 }, // Indigo blazer, slate
  { top: 0xf1f5f9, bottom: 0x475569 }  // Ivory top, grey trousers
];

export function generateWorkerProfiles() {
  // 34 workers distributed across Lobby Reception/Barista + Floors 1, 2, 3
  const roles = [
    // Floor 0 staff (2)
    { role: 'Front Desk Concierge', dept: 'Operations', floor: 0, isReception: true, arrive: 7.25, depart: 18.75 },
    { role: 'Lead Barista & Café Host', dept: 'Hospitality', floor: 0, isBarista: true, arrive: 7.3, depart: 17.8 },
    // Floor 1: Product & Design (12 desks)
    { role: 'VP of Design', dept: 'Design', floor: 1, arrive: 8.2, depart: 17.9 },
    { role: 'Staff UX Designer', dept: 'Design', floor: 1, arrive: 8.4, depart: 17.5 },
    { role: 'Product Designer', dept: 'Design', floor: 1, arrive: 8.65, depart: 17.7 },
    { role: 'Interaction Designer', dept: 'Design', floor: 1, arrive: 8.9, depart: 18.1 },
    { role: 'Design Systems Lead', dept: 'Design', floor: 1, arrive: 8.1, depart: 17.3 },
    { role: 'Senior Product Manager', dept: 'Product', floor: 1, arrive: 8.0, depart: 18.0 },
    { role: 'Product Manager', dept: 'Product', floor: 1, arrive: 8.35, depart: 17.6 },
    { role: 'UX Researcher', dept: 'Design', floor: 1, arrive: 8.75, depart: 17.4 },
    { role: 'Brand Illustrator', dept: 'Design', floor: 1, arrive: 9.05, depart: 18.2 },
    { role: 'Motion Designer', dept: 'Design', floor: 1, arrive: 8.85, depart: 17.9 },
    // Floor 2: Engineering & Ops (12 desks)
    { role: 'Principal Architect', dept: 'Engineering', floor: 2, arrive: 7.75, depart: 17.6 },
    { role: 'Staff Backend Engineer', dept: 'Engineering', floor: 2, arrive: 8.15, depart: 17.8 },
    { role: 'Frontend Lead', dept: 'Engineering', floor: 2, arrive: 8.5, depart: 18.1 },
    { role: 'Site Reliability Eng', dept: 'Cloud Ops', floor: 2, arrive: 7.6, depart: 17.2 },
    { role: 'Distributed Systems Eng', dept: 'Engineering', floor: 2, arrive: 8.7, depart: 18.4 },
    { role: 'ML Infrastructure Eng', dept: 'AI / Data', floor: 2, arrive: 8.95, depart: 18.6 },
    { role: 'Full-Stack Engineer', dept: 'Engineering', floor: 2, arrive: 8.3, depart: 17.5 },
    { role: 'Security Engineer', dept: 'Cloud Ops', floor: 2, arrive: 7.95, depart: 17.3 },
    { role: 'Mobile iOS Engineer', dept: 'Engineering', floor: 2, arrive: 8.6, depart: 17.9 },
    { role: 'Data Platform Eng', dept: 'AI / Data', floor: 2, arrive: 8.45, depart: 17.7 },
    { role: 'QA Automation Lead', dept: 'Engineering', floor: 2, arrive: 8.05, depart: 17.15 },
    { role: 'DevOps Specialist', dept: 'Cloud Ops', floor: 2, arrive: 8.8, depart: 18.5 },
    // Floor 3: Executive, Strategy & Sales (10 desks including 2 corner offices)
    { role: 'Chief Executive Officer', dept: 'Executive', floor: 3, isExec: 'ceo', arrive: 8.1, depart: 18.3 },
    { role: 'Chief Technology Officer', dept: 'Executive', floor: 3, isExec: 'cto', arrive: 7.85, depart: 18.45 },
    { role: 'VP of Strategy', dept: 'Strategy', floor: 3, arrive: 8.2, depart: 17.85 },
    { role: 'Enterprise Sales Lead', dept: 'Revenue', floor: 3, arrive: 8.0, depart: 17.4 },
    { role: 'Account Executive', dept: 'Revenue', floor: 3, arrive: 8.3, depart: 17.6 },
    { role: 'Financial Controller', dept: 'Finance', floor: 3, arrive: 7.9, depart: 17.25 },
    { role: 'Partnerships Director', dept: 'Revenue', floor: 3, arrive: 8.55, depart: 17.95 },
    { role: 'Chief of Staff', dept: 'Executive', floor: 3, arrive: 7.8, depart: 18.2 },
    { role: 'People & Culture Lead', dept: 'People', floor: 3, arrive: 8.4, depart: 17.35 },
    { role: 'Revenue Operations', dept: 'Revenue', floor: 3, arrive: 8.65, depart: 17.75 }
  ];

  return roles.map((r, idx) => {
    const outfit = TOP_PALETTES[idx % TOP_PALETTES.length];
    return {
      id: idx,
      name: `${FIRST_NAMES[idx % FIRST_NAMES.length]} ${LAST_NAMES[idx % LAST_NAMES.length]}`,
      role: r.role,
      dept: r.dept,
      homeFloor: r.floor,
      isReception: !!r.isReception,
      isBarista: !!r.isBarista,
      isExec: r.isExec || null,
      arrivalHour: r.arrive + ((idx * 7) % 11) * 0.02,
      departureHour: r.depart + ((idx * 5) % 9) * 0.025,
      lunchHour: 11.85 + ((idx * 13) % 17) * 0.065, // staggered 11:51 AM to 12:57 PM
      skinColor: SKIN_TONES[idx % SKIN_TONES.length],
      hairColor: HAIR_COLORS[(idx * 3) % HAIR_COLORS.length],
      hairStyle: idx % 4,
      topColor: outfit.top,
      bottomColor: outfit.bottom,
      heightScale: 0.94 + ((idx * 11) % 13) * 0.01,
      stairAffinity: 0.22 + ((idx * 3) % 5) * 0.12, // likelihood to use stairs for 1-floor hops
      sociability: 0.4 + ((idx * 7) % 6) * 0.1
    };
  });
}
