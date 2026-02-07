# 3D Elevator Simulation

A browser-based Three.js simulation visualizing a 6-floor building with an elevator transporting people between floors.

## How to Run

Simply open the `index.html` file in any modern web browser. No build process or server required!

### Quick Start Options:
1. **Double-click** `index.html` to open it directly in your browser
2. **Drag & drop** `index.html` onto a browser window
3. Use Python's built-in server (if needed):
   ```bash
   python3 -m http.server 8000
   ```
   Then open http://localhost:8000 in your browser

## Features

- **Transparent Building**: Semi-transparent walls and floors (opacity 0.3) with a clear elevator shaft
- **Realistic Elevator**: Semi-transparent yellow car with sliding doors that open/close
- **Animated People**: Humanoid figures with proper body proportions, feet aligned with floor level, and arms hanging down from shoulders
- **Smooth Animations**: Elevator movement, door operations, and walking animations with leg swing
- **Interactive Controls**: Orbit around the building to view from any angle
- **Speed Control**: Adjust animation speed using the slider (1x-20x)

## Files

- `index.html`: Main HTML file that loads Three.js and the simulation scripts
- `elevator.js`: Core simulation logic, building creation, and animations
- `person.js`: Factory function for creating 3D person models

## Configuration

You can modify these constants in `elevator.js`:
```javascript
const FLOOR_HEIGHT = 6;      // Height of each floor
const FLOOR_COUNT = 6;        // Number of floors
const BUILDING_WIDTH = 20;   // Building dimensions
const BUILDING_DEPTH = 20;
const SHAFT_WIDTH = 4;       // Elevator shaft size
const SHAFT_DEPTH = 3.5;
const ELEVATOR_SPEED = 1.0;   // Elevator movement speed
const PERSON_MOVE_SPEED = 1.5; // Person walking speed
```
