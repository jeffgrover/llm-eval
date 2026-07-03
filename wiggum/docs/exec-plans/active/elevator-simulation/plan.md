# Elevator Simulation — Approved Plan

## Goal
Implement a 3D elevator simulation with Three.js in `wiggum/elevator/` that visualizes a 6-floor building, a moving elevator car with sliding doors, and animated people boarding/exiting — all running in the browser with no build process.

## Scope

### In-scope
- `index.html` — Three.js 0.147.0 + OrbitControls CDN, speed slider (1x–20x), script tags in correct order, no ES modules, no iframes/file:// URLs
- `elevator.js` — Top-level constants (FLOOR_HEIGHT, FLOOR_COUNT, etc.), scene/camera/renderer/controls setup, 6-floor building with transparent floors and walls, elevator car with yellow frame + sliding doors, random-person simulation cycle, callback-based animation pipeline, walking/leg animation, `if (document.readyState...)` auto-start at the bottom
- `person.js` — `createPerson()` factory returning a THREE.Group with `userData = { leftLeg, rightLeg, isWalking: false }`, arms hanging down from shoulders, proper body hierarchy (legs → torso → head), no shared simulation globals
- Run `node ../../static_check.js .` and fix all reported issues
- Run `node ../../runtime_check.js .` if Playwright is available, fix all reported issues

### Out of scope
- Automated browser testing (human visual inspection is the final test)
- Performance optimization beyond baseline
- Sound, UI polish, or extra features not in the prompt

## Approach
- Plain browser scripts — no `import`/`export`, no build tools
- Reparenting between scene and elevatorCar uses `.attach()` (not `.add()`) to preserve world position
- `renderOrder` on transparent surfaces to prevent z-fighting (`depthWrite: false`, `side: THREE.DoubleSide`)
- Animation pipeline: `addAnimationTask(update, onComplete)` for sequential door/person/elevator steps
- Color scheme is flexible — deviate if it improves the visual result
- Follow all structural requirements from the prompt: exact constant names, `elevatorCar` global, `.attach()` for reparenting, auto-start at bottom of `elevator.js`

## Files / Surfaces Affected
- `wiggum/elevator/index.html` (new)
- `wiggum/elevator/elevator.js` (new)
- `wiggum/elevator/person.js` (new)
- Checker runs from `llm-eval/` root, fixes in the above files

## Test & Acceptance Criteria
- `node ../../static_check.js .` reports zero errors
- `node ../../runtime_check.js .` reports zero errors (if Playwright available)
- Opening `index.html` in a browser shows: transparent building, yellow elevator with visible passengers, door animations, person walking with leg swing, speed slider works, OrbitControls works, no console errors

## Risks / Open Questions
- Playwright may not be installed — `runtime_check.js` will fail silently or report missing dep
- CDN availability for Three.js 0.147.0 (well-established CDN, should be fine)
