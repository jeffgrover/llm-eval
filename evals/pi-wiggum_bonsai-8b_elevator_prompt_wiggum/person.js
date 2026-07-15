const person = new THREE.Object3D();

person.position.set(0, 1, 0);

scene.add(person);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);

camera.position.set(0, 10, 10);

const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);

const elevatorCar = new THREE.BoxGeometry(1, 2, 1);
const elevatorCarMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

elevatorCar.material = elevatorCarMaterial;
elevatorCar.position.set(0, 5, 0);
scene.add(elevatorCar);

const controls = new THREE.OrbitControls(camera, renderer.domElement);

document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth/window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    controls.enableOrbitControls = true;

    // JavaScript code for elevator simulation will go here
});