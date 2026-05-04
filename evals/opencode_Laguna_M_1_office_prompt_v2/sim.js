(function(root) {
    const MAX_WORKERS = 20;
    const MAX_VISITORS = 80;
    const MAX_OCCUPANCY = 100;
    const DEFAULT_OCCUPANCY = 45;
    
    const FIRST_NAMES = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Avery', 'Quinn', 'Devon'];
    
    class SimClock {
        constructor() {
            this.simMinute = 7 * 60 + 30;
            this.timeScale = 120;
            this.prevRealTime = performance.now();
        }
        
        tick(realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24 * 60) {
                this.simMinute -= 24 * 60;
                return true;
            }
            return false;
        }
        
        format() {
            const h = Math.floor(this.simMinute / 60);
            const m = Math.floor(this.simMinute % 60);
            const ampm = h >= 12 ? 'PM' : 'AM';
            const displayH = ((h + 11) % 12 + 1);
            return `${displayH}:${String(m).padStart(2, '0')} ${ampm}`;
        }
    }

    class Agent {
        constructor(id, role, deskId, homeFloor) {
            this.id = id;
            this.role = role;
            this.name = FIRST_NAMES[id % FIRST_NAMES.length] + (role === 'WORKER' ? ` W${id + 1}` : ` V${id + 1}`);
            this.deskId = deskId;
            this.homeFloor = homeFloor;
            this.group = null;
            this.state = 'DISABLED';
            this.plan = [];
            this.currentAction = null;
            
            this.arrivalTime = 0;
            this.lunchTime = 0;
            this.lunchDuration = 0;
            this.departureTime = 0;
            this.plannedMeetingTimes = [];
            this.hasLunched = false;
            
            this.assignedSeat = null;
        }
        
        generateSchedule(clock) {
            this.arrivalTime = Math.floor(8 * 60 + Math.random() * 75);
            this.lunchTime = Math.floor(11.5 * 60 + Math.random() * 120);
            this.lunchDuration = 25 + Math.random() * 35;
            
            if (Math.random() < 0.15) {
                this.departureTime = Math.floor(18.5 * 60 + Math.random() * 75);
            } else {
                this.departureTime = Math.floor(16.75 * 60 + Math.random() * 85);
            }
            
            this.plannedMeetingTimes = [];
            if (Math.random() < 0.5) {
                const morning = Math.floor(9.5 * 60 + Math.random() * 120);
                this.plannedMeetingTimes.push(morning);
            }
            if (Math.random() < 0.5) {
                const afternoon = Math.floor(13 * 60 + Math.random() * 180);
                this.plannedMeetingTimes.push(afternoon);
            }
        }
    }

    const createSimulator = () => {
        const scene = new THREE.Scene();
        scene.sortObjects = true;
        
        const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(28, 24, 28);
        
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(renderer.domElement);
        
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 10, 0);
        
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);
        
        const sun = new THREE.DirectionalLight(0xffffff, 0.8);
        sun.position.set(30, 50, 20);
        scene.add(sun);
        
        const hemi = new THREE.HemisphereLight(0x88aaff, 0x446633, 0.4);
        scene.add(hemi);
        
        const world = createWorld(scene);
        const elevator = new Elevator(scene, world);
        
        const clock = new SimClock();
        
        const agents = [];
        const seatReservations = new Set();
        
        const initAgents = (targetOccupancy) => {
            agents.length = 0;
            seatReservations.clear();
            
            for (let i = 0; i < MAX_WORKERS; i++) {
                const agent = new Agent(i, 'WORKER', i, 1 + Math.floor(i / 4));
                agent.state = i < targetOccupancy ? 'AWAY' : 'DISABLED';
                agent.generateSchedule(clock);
                agents.push(agent);
            }
            
            for (let i = 0; i < MAX_VISITORS; i++) {
                const agent = new Agent(MAX_WORKERS + i, 'VISITOR', -1, -1);
                agent.state = i < targetOccupancy ? 'AWAY' : 'DISABLED';
                agent.generateSchedule(clock);
                agents.push(agent);
            }
        };
        
        let targetOccupancy = DEFAULT_OCCUPANCY;
        initAgents(targetOccupancy);
        
        const topUpVisitors = () => {
            const presentCount = agents.filter(a => a.state !== 'DISABLED' && a.state !== 'AWAY' && a.state !== 'GONE').length;
            const deficit = Math.max(0, targetOccupancy - presentCount);
            
            let filled = 0;
            for (const agent of agents) {
                if (agent.role !== 'VISITOR') continue;
                if (agent.state !== 'AWAY' && agent.state !== 'GONE') continue;
                if (filled >= deficit) break;
                
                agent.state = 'AWAY';
                agent.generateSchedule(clock);
                agent.hasLunched = false;
                filled++;
            }
        };
        
        const applyOccupancy = (newTarget) => {
            targetOccupancy = Math.max(1, Math.min(MAX_OCCUPANCY, newTarget));
            for (let i = 0; i < agents.length; i++) {
                agents[i].state = i < targetOccupancy ? 'AWAY' : 'DISABLED';
            }
        };
        
        const updateLighting = () => {
            const mins = clock.simMinute;
            const h = mins / 60;
            
            let bgRgb, sunRgb, ambientIntensity, hemiIntensity;
            
            if (h < 6 || h >= 19) {
                bgRgb = [0x22 / 255, 0x22 / 255, 0x33 / 255];
                sunRgb = [0.2, 0.2, 0.3];
                ambientIntensity = 0.45;
                hemiIntensity = 0.32;
            } else if (h < 6.5) {
                const t = (h - 6) / 0.5;
                bgRgb = [0.22 + t * 0.18, 0.22 + t * 0.18, 0.33 - t * 0.1];
                sunRgb = [0.3 + t * 0.4, 0.3 + t * 0.35, 0.4 + t * 0.3];
                ambientIntensity = 0.45 + t * 0.15;
                hemiIntensity = 0.32 + t * 0.1;
            } else if (h < 18) {
                bgRgb = [0.4, 0.55, 0.75];
                sunRgb = [1, 1, 0.9];
                ambientIntensity = 0.6;
                hemiIntensity = 0.4;
            } else {
                const t = Math.min(1, (h - 18) / 0.5);
                bgRgb = [0.4 - t * 0.18, 0.55 - t * 0.25, 0.75 - t * 0.35];
                sunRgb = [1 - t * 0.6, 1 - t * 0.7, 0.9 - t * 0.5];
                ambientIntensity = 0.6 - t * 0.15;
                hemiIntensity = 0.4 - t * 0.08;
            }
            
            renderer.setClearColor(new THREE.Color(bgRgb[0], bgRgb[1], bgRgb[2]));
            sun.color.setRGB(sunRgb[0], sunRgb[1], sunRgb[2]);
            ambient.intensity = ambientIntensity;
            hemi.intensity = hemiIntensity;
        };
        
        const animate = () => {
            const realDt = Math.min(0.05, clock.prevRealTime ? (performance.now() - clock.prevRealTime) / 1000 : 0.016);
            clock.prevRealTime = performance.now();
            
            const wrapped = clock.tick(realDt);
            
            if (wrapped) {
                initAgents(targetOccupancy);
                elevator.reset();
            }
            
            updateLighting();
            
            const motionDt = realDt * clock.timeScale;
            elevator.tick(motionDt);
            
            topUpVisitors();
            
            for (const agent of agents) {
                if (agent.state === 'AWAY' && clock.simMinute >= agent.arrivalTime) {
                    if (agent.group) {
                        scene.add(agent.group);
                    } else {
                        agent.group = createPerson();
                        scene.add(agent.group);
                    }
                    agent.state = 'ARRIVING';
                    agent.plan = [];
                    agent.plan.push({ type: 'ENTER_STATE', state: 'ARRIVING' });
                }
            }
            
            controls.update();
            renderer.render(scene, camera);
            requestAnimationFrame(animate);
        };
        
        const createHUD = () => {
            const hud = document.createElement('div');
            hud.style.cssText = 'position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); color: white; padding: 10px; font-family: monospace; font-size: 14px;';
            hud.innerHTML = `
                <div id="time">Time: ${clock.format()}</div>
                <div>Speed: <input type="range" id="speed" min="0" max="6" value="2"></div>
                <div>Occupancy: <input type="range" id="occupancy" min="1" max="${MAX_OCCUPANCY}" value="${DEFAULT_OCCUPANCY}"></div>
            `;
            document.body.appendChild(hud);
            
            document.getElementById('speed').addEventListener('input', (e) => {
                const speeds = [1, 2, 5, 10, 20, 50, 600];
                clock.timeScale = speeds[parseInt(e.target.value)];
            });
            
            document.getElementById('occupancy').addEventListener('input', (e) => {
                applyOccupancy(parseInt(e.target.value));
            });
        };
        
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
        
        createHUD();
        animate();
    };
    
    createSimulator();
})(typeof window !== 'undefined' ? window : globalThis);