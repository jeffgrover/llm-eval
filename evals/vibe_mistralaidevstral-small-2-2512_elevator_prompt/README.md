# 3D Elevator Simulation

A browser-based 3D elevator simulation using Three.js with no build process required.

## How to Run

1. Open the `index.html` file in any modern web browser
2. The simulation will automatically start
3. Use the speed slider to control animation speed (1x-20x)
4. Use mouse/touch to rotate and zoom the camera view

## Features

- 6-floor building with transparent floors and semi-transparent walls
- Semi-transparent yellow elevator car with visible passengers inside
- Realistic door opening/closing animations
- People facing the elevator, walking forward through open doors
- Smooth leg animation during walking
- Proper transparency rendering to prevent z-fighting
- Camera controls for interactive viewing

## Files

- `index.html`: Main HTML file with script loading
- `person.js`: Humanoid figure creation and animation logic
- `elevator.js`: Building, elevator, and simulation logic

## Technical Details

- Uses Three.js 0.128.0 from CDN
- No build process required - runs directly in browser
- Proper transparency handling with `depthWrite: false`
- Parent-child relationships for elevator movement
- Callback-based animation pipeline