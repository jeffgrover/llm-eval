(function(global) {
    // Reference to Elevator class from elevator.js
    var Elevator = global.Elevator || window.Elevator;

    // Global simulation variables
    var scene, camera, renderer, controls;
    var world, elevator;
    var agents = [];
    var Clock = {
        simMinute: 450, // 7:30 AM
        timeScale: 120, // 2x real-time (fast)
        tick: function(realDt) {
            this.simMinute += realDt * this.timeScale / 60;
            if (this.simMinute >= 24*60) {
                // New day
                this.simMinute -= 24*60;
                resetAllAgents();
                elevator.reset();
            }
        },
        format: function() {
            var m = Math.floor(this.simMinute);
            var hrs = Math.floor(m / 60);
            var mins = m % 60;
            var ampm = hrs >= 12 ? "PM" : "AM";
            var h12 = hrs % 12;
            if (h12 === 0) h12 = 12;
            return " " + h12 + ":" + (mins<10?'0':'') + mins + " " + ampm;
        }
    };

    function startSimulation() {
        // Scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x20242a);

        // Camera
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(28, 24, 28);

        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.sortObjects = true;
        document.body.appendChild(renderer.domElement);

        // Controls
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, 6, 0);

        // Lights
        var ambient = new THREE.AmbientLight(0xffffff, 0.45);
        scene.add(ambient);
        var hemi = new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45);
        scene.add(hemi);
        var sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(20, 35, 18);
        scene.add(sun);

        // Create world and elevator
        world = createWorld(scene);
        elevator = new Elevator(scene, world);
        var buildingGroup = world.buildingGroup;
        if (buildingGroup) scene.add(buildingGroup);

        // Add some initial people for visual baseline
        var person1 = createPerson({ bodyColor: '#e85e46' });
        person1.position.set(0, 0, 10);
        scene.add(person1);
        var person2 = createPerson({ bodyColor: '#4a90e2' });
        person2.position.set(1, 0, 10);
        scene.add(person2);

        // Initialize agents pool
        initAgents();

        // Start animation loop
        function animate() {
            requestAnimationFrame(animate);
            updateSimulation();
            updateHUD();
            controls.update();
            renderer.render(scene, camera);
        }
        animate();

        // UI slider handlers (simple)
        window.addEventListener('resize', function() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    function updateSimulation() {
        var realDt = Math.min(0.05, Clock.getDelta ? Clock.getDelta() : 0.016);
        Clock.tick(realDt);

        // Update elevator
        if (elevator) elevator.tick(realDt);

        // Update agents
        updateAgents(realDt);

        // Update lighting based on simulated time
        updateLighting();
    }

    function updateLighting() {
        // Map simMinute to hours/minutes
        var mins = Clock.simMinute;
        var hrs = mins / 60;
        // Day from 06:00 to 18:00, night from 18:00 to 06:00
        var ambient = scene.children.find(function(c) { return c.type === 'AmbientLight'; });
        var hemi = scene.children.find(function(c) { return c.type === 'HemisphereLight'; });
        var sun = scene.children.find(function(c) { return c.type === 'DirectionalLight'; });

        // Simplified day/night cycle
        var intensity = 1.0;
        if (hrs < 6 || hrs > 18) {
            // Night
            if (ambient) ambient.intensity = 0.45;
            if (hemi) hemi.intensity = 0.32;
            if (sun) sun.intensity = 0.1;
        } else {
            // Day
            if (ambient) ambient.intensity = 0.7;
            if (hemi) hemi.intensity = 0.6;
            if (sun) sun.intensity = 0.9;
        }
    }

    function updateAgents(dt) {
        // Process each agent
        for (var i = 0; i < agents.length; i++) {
            var agent = agents[i];
            if (agent.userData && agent.userData.state === 'DISABLED') continue;

            // Daily schedule handling
            processAgentDailySchedule(agent, dt);

            // Animation
            animatePersonWalking(agent, dt);
        }
    }

    function processAgentDailySchedule(agent, dt) {
        var userData = agent.userData;
        if (!userData) return;

        // Initialize wander state if not set
        if (!userData.targetNode) {
            userData.targetNode = pickRandomNode();
            userData.state = 'WANDERING';
        }

        // Move towards target
        if (userData.state === 'WANDERING') {
            var target = userData.targetNode;
            if (target) {
                // Simple move: if far enough, move towards
                var dist = agent.position.distanceTo(new THREE.Vector3(target.x, agent.position.y, target.z));
                if (dist > 0.5) {
                    agent.lookAt(target.x, agent.position.y, target.z);
                    var moveSpeed = 1.5;
                    var dir = new THREE.Vector3();
                    dir.subVectors(target, new THREE.Vector3(0, agent.position.y, 0)).normalize();
                    agent.position.add(dir.multiplyScalar(moveSpeed * dt));
                    userData.isWalking = true;
                } else {
                    // Reached target, pick new
                    userData.targetNode = pickRandomNode();
                    userData.isWalking = false;
                }
            } else {
                userData.state = 'IDLE';
            }
        }
    }

    function pickRandomNode() {
        // Pick a random floor and node
        var floors = window.WORLD ? window.WORLD.floors : [];
        if (floors.length === 0) return new THREE.Vector3(0, 0, 0);
        var floor = floors[Math.floor(Math.random() * floors.length)];
        var nodes = floor.nodes;
        var nodeKeys = Object.keys(nodes);
        if (nodeKeys.length === 0) return new THREE.Vector3(0, 0, 0);
        var key = nodeKeys[Math.floor(Math.random() * nodeKeys.length)];
        return nodes[key].clone();
    }

    function initAgents() {
        // Create a small pool of agents for baseline
        // We'll need to integrate with WORLD constant
        for (var i = 0; i < 5; i++) {
            var person = createPerson({ bodyColor: '#'+Math.floor(Math.random()*16777215).toString(16) });
            person.position.set(Math.random()*10-5, 0, 12+Math.random()*5);
            person.userData = {
                state: 'AWAY',
                plan: [],
                currentAction: null
            };
            agents.push(person);
            scene.add(person);
        }
    }

    function resetAllAgents() {
        // Clear and recreate agents
        for (var i = 0; i < agents.length; i++) {
            scene.remove(agents[i]);
        }
        agents = [];
        initAgents();
    }

    function animatePersonWalking(person, dt) {
        if (!person) return;
        var userData = person.userData;
        if (userData.isSitting) {
            userData.isWalking = false;
        } else if (userData.isWalking) {
            userData.walkPhase += dt * 8;
            var legGroup = person.children[0];
            var leftLeg = legGroup.children[0];
            var rightLeg = legGroup.children[1];
            var armGroup = person.children[2];
            var leftArm = armGroup.children[0];
            var rightArm = armGroup.children[1];
            leftLeg.rotation.x = Math.sin(userData.walkPhase) * 0.6;
            rightLeg.rotation.x = -Math.sin(userData.walkPhase) * 0.6;
            leftArm.rotation.x = -Math.sin(userData.walkPhase) * 0.5;
            rightArm.rotation.x = Math.sin(userData.walkPhase) * 0.5;
        } else {
            var legGroup = person.children[0];
            var leftLeg = legGroup.children[0];
            var rightLeg = legGroup.children[1];
            var armGroup = person.children[2];
            var leftArm = armGroup.children[0];
            var rightArm = armGroup.children[1];
            leftLeg.rotation.x = 0;
            rightLeg.rotation.x = 0;
            leftArm.rotation.x = 0;
            rightArm.rotation.x = 0;
            userData.walkPhase = 0;
        }
    }

    function updateHUD() {
        // Simple HUD update
        var timeDisplay = document.getElementById('simTime');
        if (timeDisplay) timeDisplay.textContent = Clock.format();
    }

    global.startSimulation = startSimulation;
    global.Clock = Clock;
    window.Clock = Clock;

    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", startSimulation);
    } else {
        startSimulation();
    }

})(typeof window !== "undefined" ? window : globalThis);
