// Assume WORLD, Materials, createWorld, Elevator, and person functions are available globally/imported.

// Constants defined in world.js
const MAX_WORKERS = 20;
const MAX_VISITORS = 80;
const MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS;
const DEFAULT_OCCUPANCY = 45;

/**
 * Simple Clock object managing simulated time.
 */
class Clock {
    constructor() {
        this.simMinute = 7 * 60 + 30; // 07:30 AM start
        this.timeScale = 120; // Default: 120x realtime
    }

    /**
     * @param {number} realDt - Delta time in real seconds.
     */
    tick(realDt) {
        // Advance simMinute: (realDt * timeScale / 60) gives minutes
        this.simMinute += (realDt * this.timeScale / 60); 

        // Check for day wrap
        if (this.simMinute >= 24 * 60) {
            this.simMinute = 0;
            console.log("--- DAY RESET: Re-initializing agents and elevator state ---");
            // This signal is crucial for sim.js to handle full reset
            return 'DAY_WRAP'; 
        }
        return null;
    }

    format() {
        const totalMinutes = Math.floor(this.simMinute);
        const hours = Math.floor(totalMinutes / 60) % 24;
        const minutes = totalMinutes % 60;
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayHours = hours % 12 === 0 ? 12 : hours % 12;
        return ` ${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
    }
}

/**
 * Handles time-of-day lighting and background color interpolation.
 * @param {number} simMinute - Current simulated minute.
 * @returns {Object} Light and color parameters.
 */
function getLighting(simMinute) {
    // Map minutes (0 to 1440) to a day cycle (0 to 1).
    const dayCycle = (simMinute / (24 * 60)) % 1;

    // Define keyframes for the light cycle
    // 0.25 (06:00 AM) -> Dawn, 0.5 (12:00 PM) -> Midday, 0.75 (18:00 PM) -> Dusk
    
    let sunIntensity = 0.0;
    let ambientIntensity = 0.45; // Keep ambient up at night
    let hemiIntensity = 0.32; // Keep hemi up at night
    let skyColor = new THREE.Color(0x222233);

    if (dayCycle >= 0.24 && dayCycle <= 0.76) {
        // Day cycle (Dawn to Dusk)
        let relativeDay = (dayCycle - 0.24) / 0.52; // Normalize within the bright period (0.24 to 0.76)
        
        // Fast transition into Golden Hour (06:00-06:30 -> dayCycle ~0.25-0.275)
        if (dayCycle < 0.3) {
            // Dawn phase (06:00 - 06:30)
            const dawnFactor = (dayCycle - 0.24) / 0.06; // 0 to 1
            sunIntensity = THREE.MathUtils.lerp(0.0, 0.8, dawnFactor);
            ambientIntensity = THREE.MathUtils.lerp(0.45, 0.6, dawnFactor);
            hemiIntensity = THREE.MathUtils.lerp(0.32, 0.5, dawnFactor);
        } else if (dayCycle > 0.7) {
            // Dusk phase (17:30 - 18:30 -> dayCycle ~0.75-0.8)
            const duskFactor = (dayCycle - 0.7) / 0.1; // 0 to 1
            sunIntensity = THREE.MathUtils.lerp(0.8, 0.0, duskFactor);
            ambientIntensity = THREE.MathUtils.lerp(0.6, 0.45, duskFactor);
            hemiIntensity = THREE.MathUtils.lerp(0.5, 0.32, duskFactor);
        } else {
            // Full Day phase (06:30 - 17:30)
            sunIntensity = 0.8;
            ambientIntensity = 0.6;
            hemiIntensity = 0.5;
        }
    }

    return { sunIntensity, ambientIntensity, hemiIntensity, skyColor };
}

// --- Agent Management ---

/**
 * Creates a random short name.
 */
function getRandomName() {
    const names = ["Alex", "Beth", "Chris", "Dana", "Evan", "Fiona", "Gary", "Holly", "Ian", "Jade"];
    return names[Math.floor(Math.random() * names.length)];
}

/**
 * Generates a random schedule for an agent.
 * @returns {Object} Schedule data.
 */
function generateSchedule() {
    // Arrival: 8:15..9:30 (495 to 570 minutes)
    const arrivalTime = Math.floor(Math.random() * 76 + 495); 
    // Lunch: 11:30..13:30 (750 to 810 minutes)
    const lunchTime = Math.floor(Math.random() * 61 + 750);
    // Lunch Duration: 25..60 minutes
    const lunchDuration = Math.floor(Math.random() * 36 + 25);
    // Departure: 16:45..18:30 (1005 to 1110 minutes)
    const departureTime = Math.floor(Math.random() * 106 + 1005);
    const isStraggler = Math.random() < 0.15;
    let stragglerTime = isStraggler ? Math.floor(Math.random() * 135 + 1110) : departureTime;

    return {
        arrivalTime: arrivalTime,
        lunchTime: lunchTime,
        lunchDuration: lunchDuration,
        departureTime: isStraggler ? stragglerTime : departureTime,
        plannedMeetingTimes: [
            Math.floor(Math.random() * 120 + 500), // Morning meeting (500-620 mins)
            Math.floor(Math.random() * 180 + 850)  // Afternoon meeting (850-1030 mins)
        ]
    };
}

/**
 * Top-up visitor scheduler: recycles GONE/AWAY visitors into AWAY state.
 * @param {Array} agents - The pool of all agents.
 * @param {number} targetOccupancy - The current target for occupancy.
 * @param {number} currentPresentCount - How many agents are currently active.
 */
function topUpVisitors(agents, targetOccupancy, currentPresentCount) {
    let deficit = targetOccupancy - currentPresentCount;

    if (deficit <= 0) return;

    const visitorsToRecycle = agents.filter(a => a.role === 'VISITOR' && a.state === 'GONE' || a.state === 'AWAY');

    for (let i = 0; i < deficit && visitorsToRecycle.length > 0; i++) {
        const visitor = visitorsToRecycle.pop();
        
        // Re-roll schedule for fresh visit
        visitor.schedule = generateSchedule();
        
        // Re-arm for a new arrival time (0 to 6 minutes out)
        const reArmedTime = Math.floor(Math.random() * 6 + 1);
        visitor.arrivalTime = Math.floor(Clock.simMinute + reArmedTime * 60); 
        visitor.state = 'AWAY'; // Ready to be picked up by scheduler
    }
}

/**
 * Main simulation loop function.
 * @param {Object} scene - Three.js scene.
 * @param {Object} world - World data.
 * @param {Object} elevator - Elevator instance.
 * @param {Clock} clock - Simulation clock.
 * @param {Array} agents - Agent pool.
 * @param {number} targetOccupancy - Target for occupancy slider.
 */
function renderLoop(scene, world, elevator, clock, agents, targetOccupancy) {
    // --- Step 1: Advance Clock and Lighting ---
    const realDt = 0.05; // Fixed delta time for simulation
    const dayChange = clock.tick(realDt);
    
    let dayWrap = false;
    if (dayChange === 'DAY_WRAP') {
        dayWrap = true;
        // Reset logic triggered here
        agents.forEach(a => {
            a.schedule = generateSchedule(); // Reset all schedules
            a.state = 'AWAY';
            a.group.visible = false;
            a.plan = [];
        });
        elevator.reset();
    }

    const lightingParams = getLighting(clock.simMinute);
    // Apply lighting changes (in real implementation, this involves setting THREE.AmbientLight/DirectionalLight properties)
    
    // --- Step 2: Update Occupancy & Top-up ---
    
    // Determine current occupancy
    const countPresent = agents.filter(a => a.state !== 'DISABLED').length;
    
    // Dynamic Top-up: Recycle visitors
    topUpVisitors(agents, targetOccupancy, countPresent);

    // --- Step 3: Agent State Machine Dispatch & Movement ---
    
    // This must loop multiple times per frame to handle zero-duration actions (e.g., SIT -> ENTER_ELEVATOR)
    const MAX_ACTION_ITERATIONS = 16;
    for (let i = 0; i < MAX_ACTION_ITERATIONS; i++) {
        let actionHandled = false;
        
        for (const agent of agents) {
            if (agent.state === 'DISABLED' || agent.state === 'GONE') continue;

            // 3.1 Check for Arrival (AWAY -> ARRIVING/WAITING_ELEVATOR)
            if (agent.state === 'AWAY' && agent.schedule.arrivalTime <= Math.floor(clock.simMinute)) {
                agent.state = 'ARRIVING';
                agent.group.visible = true;
                // Spawn jitter implementation here
                // agent.group.position.x += Math.random() * 2 - 1; 
                // agent.group.position.z += Math.random() * 1 - 0.5; 
            }

            if (agent.state !== 'DISABLED') {
                // Run Agent Action Dispatch Loop
                if (agent.currentAction) {
                    // Execute the next primitive action
                    // This function encapsulates the complex logic (WALK_TO_WP, ENTER_ELEVATOR, etc.)
                    const nextAction = agent.executeAction(world, elevator, clock, realDt);
                    
                    if (nextAction) {
                        agent.currentAction = nextAction;
                        actionHandled = true;
                    } else {
                        // Action finished or blocked
                        agent.currentAction = null;
                    }
                }
            }
        }
        if (!actionHandled && i > 0) break; // Stop if no agent changed state in a full pass
    }


    // --- Step 4: Elevator Tick ---
    elevator.tick(realDt * clock.timeScale); // MotionDt = realDt * timeScale

    // --- Step 5: Collision Resolution and Animation ---
    applyCollisions(agents);
    agents.forEach(agent => {
        if (agent.state !== 'DISABLED' && agent.state !== 'GONE') {
            animatePersonWalking(agent.group, realDt * clock.timeScale);
        }
    });

    // --- Step 6: Rendering ---
    // Update lighting based on clock
    // renderer.setClearColor(lightingParams.skyColor); 
    // renderer.setAmbientLight(lightingParams.ambientIntensity);
    // renderer.setDirectionalLight(lightingParams.sunIntensity); 
    renderer.render(scene, camera);
    updateHUD(clock, agents, elevator);
}


/**
 * Simple O(n^2) soft repulsion collision resolver.
 * @param {Array} agents 
 */
function applyCollisions(agents) {
    const pushScalar = 0.18;
    for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
            const a = agents[i];
            const b = agents[j];

            // Collision exemption for boarders
            if (a.currentAction && a.currentAction.type === 'ENTER_ELEVATOR' || 
                b.currentAction && b.currentAction.type === 'ENTER_ELEVATOR') {
                continue;
            }
            
            const posA = a.group.position;
            const posB = b.group.position;

            const distanceVec = new THREE.Vector3().subVectors(posA, posB);
            const distanceSq = distanceVec.lengthSq();
            const distance = Math.sqrt(distanceSq);

            // Check for overlap (d < 0.7 of XZ radius)
            if (distance < 0.7 && distance > 1e-3) { 
                const normal = distanceVec.normalize();
                // Apply soft repulsion
                posA.add(normal.clone().multiplyScalar(pushScalar));
                posB.sub(normal.clone().multiplyScalar(pushScalar));
            } else if (distance <= 1e-3) {
                 // Handle exact overlap (stuck) - random separation direction
                 const randomDir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
                 posA.add(randomDir.clone().multiplyScalar(0.1));
                 posB.sub(randomDir.clone().multiplyScalar(0.1));
            }
        }
    }
}

/**
 * Updates the Heads-Up Display.
 */
function updateHUD(clock, agents, elevator) {
    // Placeholder for HUD update logic
    // document.getElementById('simTime').innerText = clock.format();
    // document.getElementById('occupancy').innerText = `${agents.filter(a => a.state !== 'DISABLED').length} / ${MAX_OCCUPANCY}`;
}


// --- Initialization ---

let scene, camera, renderer, controls;
let clock;
let worldData;
let agentsPool = [];
let elevatorInstance;
let targetOccupancy = DEFAULT_OCCUPANCY;

function initSimulation() {
    // Scene setup
    scene = new THREE.Scene();
    
    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    camera.lookAt(0, WORLD.FLOOR_HEIGHT * 2, 0);
    
    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, sortObjects: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // World and Elevator Initialization
    worldData = createWorld(scene);
    elevatorInstance = new Elevator(scene, worldData);

    // Clock Initialization
    clock = new Clock();

    // Agent Pool Initialization (The full pool must be built at startup)
    initializeAgents(MAX_WORKERS, MAX_VISITORS);

    // Start the main loop
    window.requestAnimationFrame(() => renderLoop(scene, worldData, elevatorInstance, clock, agentsPool, targetOccupancy));
    
    // Handle window resizing
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function initializeAgents(workerCount, visitorCount) {
    const allAgents = [];

    // 1. Workers
    for (let i = 0; i < workerCount; i++) {
        const agent = {
            id: i,
            role: 'WORKER',
            name: getRandomName(),
            schedule: generateSchedule(),
            state: 'DISABLED', // Start disabled
            group: createPerson(), // Initial appearance
            plan: [],
            currentAction: null,
            homeFloor: Math.floor(Math.random() * WORLD.FLOOR_COUNT),
            deskId: `office${String.fromCharCode(65 + i % 4)}_desk`,
            groupPosition: new THREE.Vector3(0, 0, 0)
        };
        allAgents.push(agent);
    }

    // 2. Visitors
    for (let i = 0; i < visitorCount; i++) {
        const agent = {
            id: workerCount + i,
            role: 'VISITOR',
            name: getRandomName(),
            schedule: generateSchedule(),
            state: 'DISABLED',
            group: createPerson(),
            plan: [],
            currentAction: null,
            // Visitors have no fixed desk/home floor
            groupPosition: new THREE.Vector3(0, 0, 0) 
        };
        allAgents.push(agent);
    }

    agentsPool = allAgents;
}

// Start the simulation when the script loads
initSimulation();