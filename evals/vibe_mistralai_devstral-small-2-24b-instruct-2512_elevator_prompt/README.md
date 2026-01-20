# 3D Elevator Simulation

A complete browser-based 3D elevator simulation using Three.js with no build process required.

## Features

- **6-floor building** with transparent floors and semi-transparent walls
- **Elevator car** with sliding doors that open/close horizontally
- **Humanoid figures** with proper anatomy (legs, torso, head, arms)
- **Realistic animations**:
  - Elevator movement between floors
  - Door opening/closing with sliding animation
  - People walking with leg swinging animation
  - Proper parent-child relationships for elevator travel
- **Transparency rendering** with proper depth sorting
- **Orbit controls** for interactive camera rotation
- **No z-fighting** issues when rotating the view

## How to Run

Simply open the `index.html` file in any modern web browser. No server or build process required!

```bash
open index.html  # On macOS
start index.html  # On Windows
xdg-open index.html  # On Linux
```

Or double-click the file in your file explorer.

## Files

- `index.html`: Main HTML file with Three.js CDN links
- `person.js`: Factory function for creating humanoid figures
- `elevator.js`: Main simulation logic, building creation, and animations

## Controls

- **Mouse**: Click and drag to rotate the camera around the building
- **Scroll wheel**: Zoom in and out
- **Right-click and drag**: Pan the camera

## Technical Details

### Coordinate System
- Y-axis: Vertical (up/down)
- Z-axis: Front/back (positive Z = in front of elevator)

### Person Anatomy
From bottom to top:
1. Legs (cylinder) - dark blue (#2c3e50)
2. Torso (box) - blue (#3498db)
3. Head (sphere) - skin tone (#ffdbac)
4. Arms (cylinders) - blue (#3498db), hanging down from shoulders

### Elevator Car
- Frame: Semi-transparent yellow (#ffff00, opacity 0.5)
- Doors: Darker yellow (#cccc00, opacity 0.7)
- Back wall: Solid yellow
- Side walls: Transparent yellow (opacity 0.3)

### Building
- Floors: Gray (#cccccc)
  - Ground floor and roof: Solid (opacity 1.0)
  - Upper floors: Transparent (opacity 0.3)
- Walls: Blue (#9999ff, opacity 0.2)

## Animation Sequence

1. Elevator moves to pickup floor
2. Doors open (sliding animation)
3. Person walks forward into elevator with leg animation
4. Person becomes a child of the elevator object
5. Doors close
6. Elevator travels to destination floor
7. Doors open at destination
8. Person walks forward out of elevator
9. Person is removed from elevator and added back to scene
10. Doors close

## Transparency Rendering

- `renderer.alpha = true` enabled
- `renderer.sortObjects = true` for proper depth sorting
- All transparent materials have `depthWrite: false`
- All transparent materials use `side: THREE.DoubleSide`
- Render order: building=0, elevator=1

## Constants (Configurable)

Edit these values at the top of `elevator.js`:
```javascript
const FLOOR_HEIGHT = 6;
const FLOOR_COUNT = 6;
const BUILDING_WIDTH = 30;
const BUILDING_DEPTH = 30;
const SHAFT_WIDTH = 8;
const SHAFT_DEPTH = 8;
const ELEVATOR_SPEED = 0.1;
const PERSON_MOVE_SPEED = 0.05;
```

## Browser Compatibility

Works in all modern browsers:
- Chrome
- Firefox
- Safari
- Edge
