# Office Building Simulation - Wiggum Loop Prompt

Create a browser-only Three.js office-building simulation. The implementation
plan is already approved. Do not ask the human for decisions, do not request
plan approval, and do not use an interactive Wiggum TPM flow.

Success is defined by the evaluator-owned loop passing all checks:

- `node ../../static_check.js .` has zero static errors
- `node ../../runtime_check.js .` has zero startup, console, and page errors
- `node elevator_logic_test.js` passes all deterministic elevator tests
- the page loads in a browser with a visible nonblank canvas
- animation frames are observed
- scene objects are observed
- visible motion / dynamic changes are observed
- the simulation reads as a day in the life of a small office
- the elevator keeps serving trips with direction handling and a hard capacity
  limit
- workers and visitors keep progressing through their goals without permanent
  bunching at the front door, elevator doors, seats, or hallways

If checker feedback is provided in a later attempt, edit the existing files to
fix that feedback and continue. Do not stop because a check failed; iterate from
the feedback. Do not ask the human for decisions.

The simulation must not simply be "an elevator moves people between floors."
It must read as **a day in the life of a small office**, expressed through
persistent agents that pursue human goals on a simulated clock: arriving for
work, sitting at a desk to work, getting up for meetings or a chat at a
coworker's desk, breaking for lunch, drifting home around 5 PM (with a couple
of stragglers staying later), while a realistically-scheduled elevator car
ferries them up and down with proper call buttons, direction handling, and a
hard capacity limit.

Visual fidelity should be modest - simple Three.js primitives with semi-
transparent surfaces so the viewer can see through walls and follow agents.
The emphasis is on **behavioral fidelity**: the elevator acts like a real
elevator; the people act like real office workers.  Take special care that
the people don't "bunch up" too close to (or on top of) each other in
crowds or get blocked from progress toward their goals by the front door,
the elevator doors, other people or obstacles.  When models fail this task,
the reason is usually this "bunching up", and it happens often.  Also, ensure
that when the people assume a seated position their are positioned with
their legs directed toward (and sometimes slightly underneath) the desk or
table if present, and away from (in the opposite direction of) the backrest
of the chair/sofa. Do NOT forget to check the orientation of the seated figure
when the person first occupies the seat, this is another common error.  It
may seem like a minor thing, but it is worth a separate system for keeping
track of the direction of the legs in furniture... because it really breaks
the "illusion" of the simulation to see someone sitting backwards on a chair.
Also, people will laugh at you your simulation... not it a good way :)

---

## Output Contract

Create exactly these seven local files:

1. `person.js` - person mesh factory + walk/sit animation
2. `world.js` - building geometry, per-floor layouts, furniture, navigation graph, call panels
3. `elevator_logic.js` - pure elevator scheduler/state machine, no Three.js or DOM
4. `elevator.js` - Three.js elevator car, doors, indicators, and adapter around `ElevatorLogic`
5. `sim.js` - simulated clock, day/night lighting, agent state machine + daily schedules, render loop, UI
6. `elevator_logic_test.js` - Node-runnable deterministic tests for the elevator logic
7. `index.html` - loads Three.js + OrbitControls + the browser simulation scripts in order

Use classic browser scripts only:

- No `import`
- No `export`
- No `type="module"`
- No local browser script names except `person.js`, `world.js`,
  `elevator_logic.js`, `elevator.js`, and `sim.js`
- Do not load `elevator_logic_test.js` in the browser page
- No iframe/object/embed/self-preview
- No `file://`, absolute local paths, or `summary.html`

`index.html` must load scripts in this exact order:

```html
<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js"></script>
<script src="person.js"></script>
<script src="world.js"></script>
<script src="elevator_logic.js"></script>
<script src="elevator.js"></script>
<script src="sim.js"></script>
```

---

## Approved Implementation Plan

Implement the task in these small passes. Each pass should leave the page
loadable whenever browser files exist. Do not skip ahead if the basic page is
not rendering.

### Pass 1 - File Skeleton And Render Baseline

Create `index.html`, `person.js`, `world.js`, `elevator_logic.js`,
`elevator.js`, `sim.js`, and `elevator_logic_test.js`.

Requirements:

- `index.html` contains the exact script order from the Output Contract.
- `person.js` exposes `window.createPerson` and
  `window.animatePersonWalking`.
- `world.js` exposes `window.WORLD`, `window.createWorld`, and
  `window.bfsPath` or returns `bfsPath` from `createWorld`.
- `elevator_logic.js` exposes `ElevatorLogic` with the browser/Node IIFE
  pattern.
- `elevator.js` exposes `window.Elevator`.
- `sim.js` creates scene, camera, renderer, lights, OrbitControls, world, and
  elevator; appends `renderer.domElement`; starts a `requestAnimationFrame`
  loop; and auto-starts with the DOM-ready pattern.
- The initial render contains a visible building/lobby shape, elevator car,
  and at least a few person meshes.

Acceptance check for Pass 1:

- browser displays a nonblank Three.js canvas
- no missing script files
- no startup console errors
- render loop continues even before complex behavior is complete

### Pass 2 - World Geometry, Furniture, And Navigation

Build the six-floor office world described below.

Requirements:

- central shaft opening through all floors
- transparent floor/wall materials with `depthWrite: false` and
  `THREE.DoubleSide`
- ground-floor lobby with a real 3+ unit front entrance gap
- explicit `outside -> front_door_threshold -> entrance -> lobby_center`
  navigation chain
- office floors with private offices, desks, chairs, conference room, lounge,
  water cooler, hallway ring, call panels, and shaft indicators
- `sitTargets` encode both sit/stand behavior and exact facing direction

Acceptance check for Pass 2:

- building, rooms, furniture, lobby, and shaft are visible
- the front entrance is a real opening, not a solid wall with a door texture
- navigation graph includes the required entrance chain and elevator wait nodes

### Pass 3 - Person Factory And Seating Fidelity

Implement reusable person geometry and animation.

Requirements:

- feet sit at local `y = 0`
- legs and arms pivot from hip/shoulder groups
- visible nose on `+Z` face of the head
- walking animation swings legs and arms
- sitting animation bends legs forward and lowers the body to chair height
- seated orientation matches each chair, desk, couch, bistro chair, and
  conference seat

Acceptance check for Pass 3:

- people are visibly distinct
- walking people animate
- sitting people face the furniture correctly and do not stand on chairs

### Pass 4 - Elevator Logic And Tests

Implement `ElevatorLogic` as the authoritative scheduler/state machine and
cover it with deterministic Node tests.

Requirements:

- exactly five states: `IDLE`, `MOVING`, `DOOR_OPENING`, `DOOR_OPEN`,
  `DOOR_CLOSING`
- SCAN scheduling with direction, calls, destinations, capacity, pending
  boarders/disembarkers, door timing, and anti-starvation rules
- passenger destinations outrank same-floor hall calls when riders are aboard
- full lobby cars leave for passenger destinations instead of reopening at
  floor 0 forever
- moving car can shorten target to a closer same-direction stop
- `reset()` clears all phantom state

Acceptance check for Pass 4:

- `node elevator_logic_test.js` passes
- tests cover lobby rush, same-floor hall-call starvation, opposite-direction
  calls, door hold/safety cap, destination preservation, and reset behavior

### Pass 5 - Elevator Visual Adapter

Implement the Three.js car and adapter around `ElevatorLogic`.

Requirements:

- yellow transparent car frame, solid back wall, sliding front doors, in-car
  destination buttons, in-car indicator, and building-side indicators
- public `Elevator` class delegates scheduling to `ElevatorLogic`
- `tick(dt)` updates logic, car position, doors, button lights, call-panel
  lamps, and all floor indicators
- boarding spots are capacity-limited and mapped to distinct car-local targets

Acceptance check for Pass 5:

- car moves floor-to-floor
- doors open and close visibly
- indicators and call/destination lights update
- scheduler behavior is not duplicated in `elevator.js`

### Pass 6 - Agents, Daily Schedules, And Actions

Implement the office day: workers, visitors, simulated clock, plans, and
primitive actions.

Requirements:

- workers arrive, ride up, sit at desks, take lunch, attend meetings, visit
  coworkers/lounges, and leave near end of day
- visitors are dynamically topped up during business hours and recycle through
  short visit plans
- primitive action dispatch loops through zero-duration actions within one
  frame
- elevator actions preserve the explicit destination floor through
  `WAIT_AT_PANEL`, `ENTER_ELEVATOR`, `PRESS_FLOOR`, and `WAIT_FOR_FLOOR`
- scene reparenting preserves world position when entering/exiting the car
- seat reservations prevent duplicate conference-seat assignments

Acceptance check for Pass 6:

- people arrive from outside, cross the threshold, request elevators, ride,
  disperse, sit, meet, break, lunch, and leave
- visitors keep the building populated all day
- no passenger gets trapped by doors closing between zero-duration actions

### Pass 7 - Collision, Crowding, UI, And Day Wrap

Polish the system so it keeps running under crowd pressure.

Requirements:

- soft personal-space separation, with exact-overlap handling
- collision exemptions for sitting agents, elevator passengers, entrance
  crossing, and active boarders
- stall recovery for paths, front-door threshold, and elevator boarding
- day/night lighting keyed to the simulated clock
- HUD with simulated time, speed slider, occupancy slider, state counts, and
  elevator state
- day-wrap resets both agents and elevator while honoring occupancy

Acceptance check for Pass 7:

- simulation keeps moving at default occupancy
- speed and occupancy controls work
- people do not permanently bunch at the front door, elevator, seats, or
  hallways
- after a simulated day wraps, the next day starts without phantom elevator
  passengers or stale reservations

### Pass 8 - Final Verification

Run and fix all available checks before reporting completion:

```bash
node elevator_logic_test.js
node ../../static_check.js .
node ../../runtime_check.js .
```

Only report completion when the generated simulation satisfies the checks and
the browser artifact is visibly alive.

---

## Hard Browser-Load Requirements

These rules are non-negotiable. Violating any of them usually creates a blank
page even when the files look impressive in a static review.

1. **No ES modules in browser simulation files.** Do not write `import ...` or
   `export ...` in `person.js`, `world.js`, `elevator.js`, or `sim.js`. The
   page loads these files with classic `<script src="..."></script>` tags, so
   top-level `export` causes `SyntaxError: Unexpected token 'export'` and the
   simulation never starts.
2. **Use browser globals for cross-file APIs.** Attach shared browser symbols
   to `window`, for example `window.createPerson = createPerson`,
   `window.WORLD = WORLD`, `window.createWorld = createWorld`, and
   `window.Elevator = Elevator`.
   Every local script referenced by `index.html` must exist with that exact
   filename. Do not add script tags for extra local files such as `app.js`,
   `main.js`, or renamed helper files unless you also create those exact files.
3. **`elevator_logic.js` is the only dual-environment file.** It may use the
   IIFE pattern shown below to expose `window.ElevatorLogic` in the browser
   and `module.exports = { ElevatorLogic }` for Node tests. It must not use
   ES module syntax either.
4. **The simulation must auto-start on page load.** `sim.js` must call its
   init/start function at the top level or inside `DOMContentLoaded`.
   At the bottom of `sim.js`, after all functions/classes are declared, include
   this pattern adapted only for your actual start function name:

   ```js
   if (document.readyState === "loading") {
       window.addEventListener("DOMContentLoaded", startSimulation);
   } else {
       startSimulation();
   }
   ```

   If your function is named `init` or `main`, use that same name in both
   places. Do not merely attach the start function to `window` and wait for
   something else to call it; that produces a blank page with zero errors.
5. **Zero startup console errors.** A run that creates no canvas, logs
   `SyntaxError`, `ReferenceError`, `TypeError`, or has a missing script is a
   failed browser artifact, no matter how complete the code appears.
6. **Run the available checkers before finishing.** This eval repository
   provides checker scripts two directories above your workspace. After you
   create or edit the files, run:

   ```bash
   node ../../static_check.js .
   ```

   Fix every reported issue. The static checker catches syntax errors, likely
   unresolved references, and duplicate top-level `let` / `const` / `class`
   declarations across classic browser scripts. Also run:

   ```bash
   node ../../runtime_check.js .
   ```

   Fix any startup, canvas, animation, or browser page errors it reports. Do
   not report success while either checker reports errors.
7. **Render-first fallback.** Before adding complex agent schedules and
   elevator behavior, make the page visibly render a nonblank Three.js scene:
   camera, renderer, lights, the office building/lobby shape, the elevator car,
   and at least a few person meshes. Preserve that visible baseline while
   adding behavior. If the behavior loop is incomplete, a static visible office
   scene is still much better than a blank page. `node ../../runtime_check.js .`
   should at minimum report a nonblank canvas, animation frames, and scene
   objects; `no-motion` is acceptable while debugging, but `no-canvas`,
   `no-animation`, or `errors` must be fixed before you stop.
8. **No self-embedding, no `file://` URLs, no local absolute paths.**
   `index.html` is the simulation page. Do not put an `<iframe>`, `<object>`,
   `<embed>`, or preview panel inside it that points to `index.html`,
   `summary.html`, or any local path. Do not write URLs like
   `file:///Users/...`, `file:///home/...`, or `C:\Users\...` anywhere in the
   browser files. Browsers treat `file:` pages as unique security origins, so
   local self-loading produces console errors such as "Unsafe attempt to load
   URL file://... from frame with URL file://...". The page should render the
   Three.js scene directly, not embed another local document.
9. **Typo-proof shared state before finishing.** Use one spelling for each
   shared symbol and simulated-clock object, declare it before first use,
   attach cross-file APIs to `window` explicitly, and do not invent
   near-duplicate names later. If the clock is named `Clock`, `clock`, or
   `simClock`, use that spelling consistently everywhere. The static checker
   in rule 6 is the final guardrail for unbound identifiers and duplicate
   top-level declarations.
   Every callback or promise value you use must be declared in that callback's
   parameter list: use `(event) => ...`, `array.forEach((agent) => ...)`, and
   `new Promise((resolve) => ...)`. Do not rely on implicit globals such as
   `event`, `e`, `p`, `agent`, `resolve`, `x`, or `z`. Do not redeclare
   top-level `let` / `const` / `class` names later in the same file or in
   another classic script; use unique local names inside helper functions
   instead.

Before reporting completion, mentally grep the generated browser files:
`person.js`, `world.js`, `elevator.js`, and `sim.js` must contain no top-level
`import` or `export` statements, no `file://` URLs, and no self-embedding
`iframe` / `object` / `embed` tags.

---

## Files

Split the code across six JavaScript files plus an HTML shell. The browser
loads the visual simulation files in this exact order, and the pure elevator
logic also has a Node-runnable test file:

1. `person.js`  - person mesh factory + walk/sit animation
2. `world.js`   - building geometry, per-floor layouts, furniture, navigation graph, call panels
3. `elevator_logic.js` - pure elevator scheduler/state machine, no Three.js or DOM
4. `elevator.js` - Three.js elevator car, doors, indicators, and adapter around `ElevatorLogic`
5. `sim.js`     - simulated clock, day/night lighting, agent state machine + daily schedules, render loop, UI
6. `elevator_logic_test.js` - Node-runnable deterministic tests for the elevator logic
7. `index.html` - loads Three.js + OrbitControls + the browser simulation scripts in order

Browser simulation files use global variables on `window` (no ES6 modules).
`elevator_logic.js` additionally supports Node's `module.exports` so the test
file can import it. No build step.

### `index.html`

```html
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Office Building Simulation</title>
<style>html,body{margin:0;padding:0;overflow:hidden;background:#222233}canvas{display:block}</style>
</head><body>
<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js"></script>
<script src="person.js"></script>
<script src="world.js"></script>
<script src="elevator_logic.js"></script>
<script src="elevator.js"></script>
<script src="sim.js"></script>
</body></html>
```

Exact URLs and order are mandatory - OrbitControls depends on the global
`THREE` being defined first; `elevator.js` depends on `ElevatorLogic`;
`sim.js` depends on all previous browser scripts. Do not load
`elevator_logic_test.js` in the browser page.

---

## Coordinate conventions

- `+Y` is up. `+Z` is the front of the building (entrance side; elevator doors
  face `+Z`). `+X` is right.
- Floor `N` has its walkable floor at world `y = N * FLOOR_HEIGHT`.
- The shaft is a 3x3 column centered at `x=0, z=0`, extending top-to-bottom.
- Floor `0` is the ground-floor **lobby**; floors `1..FLOOR_COUNT-1` are
  **identical office floors**.

---

## `person.js`

Define a global factory function `createPerson({bodyColor?, skinColor?, legColor?})` returning
a `THREE.Group`. Body is assembled from primitives so **feet sit at local
y=0** (the person's origin). Structure bottom-to-top: legs -> torso -> head,
with arms at shoulder level.

- Each leg is its own `THREE.Group` pivoting at the **hip** (group origin at
  hip, cylinder hanging below). Arms pivot the same way at the shoulder. This
  makes walk animation a simple `rotation.x` tween at the pivot.
- Add a small hemisphere "nose" on the `+Z` face of the head so facing
  direction reads from a top-down camera.
- Sample colors from three small palettes (shirts, skin tones, pants) so the
  agents are visually distinct at a glance.

Define a global per-frame animator `animatePersonWalking(person, dt)`:
- If `userData.isSitting`: legs rotate `-pi/2` at the hip (feet forward), arms
  drop to `-pi/4`, walk phase resets.
- Else if `userData.isWalking`: advance `walkPhase += dt * 8`; legs swing
  with `sin(phase) * 0.6`, arms with `-sin(phase) * 0.5` (opposite) for a
  natural gait.
- Else: reset limbs to zero rotation (standing idle).

At the end of `person.js`, expose both functions explicitly:

```js
window.createPerson = createPerson;
window.animatePersonWalking = animatePersonWalking;
```

---

## `world.js` - building + floors + navigation

### Constants

```js
const WORLD = {
    FLOOR_HEIGHT: 3.4, FLOOR_COUNT: 6,
    BUILDING_WIDTH: 22, BUILDING_DEPTH: 18,
    SHAFT_WIDTH: 3, SHAFT_DEPTH: 3,
    PERSON_R: 0.4
};
```

### Geometry

- Ground slab and roof are solid gray.
- Intermediate floor slabs are built as four strips around the shaft opening
  (so the shaft is a clean hole top to bottom). Material: semi-transparent
  gray, `opacity: 0.3`, `depthWrite: false`, `side: DoubleSide`.
- Outer walls are semi-transparent blue (`#9999ff`, opacity 0.2). **Leave a
  3-unit-wide gap in the FRONT wall on floor 0 only** (the main entrance);
  floors 1..5 of the front wall are solid (build the front wall as three
  segments: two side panels full-height, one above-the-gap panel covering
  floors 1-5).
- Interior walls on office floors delineate rooms; slightly more visible
  (`#bbc5e6`, opacity 0.28) with 1.2-unit doorway gaps.
- All transparent materials use `depthWrite: false` + `side: DoubleSide`.
- Give the building `renderOrder = 0`.

### Per-floor layout (floors 1..5 - identical)

Each office floor contains:

- **Four private offices** along the back wall (`z` in roughly `[-9, -3]`),
  separated by interior walls, each with its own desk and chair. The desk
  monitor sits at the back of the desk; the user sits in the chair facing the
  desk (`-Z`), so walking in through the office doorway puts the person
  behind their chair.
- **One conference room** in the front-left quadrant (`x: [-11,-3]`,
  `z: [3,9]`) with a long table and four chairs (two per long side, facing
  each other across the table).
- **One lounge / break area** in the front-right quadrant (`x: [3,11]`,
  `z: [3,9]`) with a couch, coffee table, two armchairs, and a water cooler.
- **A hallway ring around the shaft**, connecting the waiting area in front
  of the elevator doors to office doors in the back and to the conference /
  lounge doors in the front.
- **A call panel on the wall next to the shaft**, facing `+Z`, with up and
  down arrow lamps and a small current-floor indicator (canvas-texture
  digits).
- **A shaft-side floor indicator** mounted above the doors showing the
  car's current floor and direction (e.g. `"3^"` going up).

### Ground floor (`floor 0`) - lobby

The lobby is deliberately busy - plenty of places for visitors to sit,
stand, and loiter. Contains:
- **Entrance** at front center (a pair of semi-transparent glass doors at
  `z = +9`, with the 3-unit gap in the outer wall). Agents spawn on the
  **sidewalk** (a concrete-colored slab outside the front wall at
  `z approx. +12`) and walk IN through the doors - and similarly walk OUT onto
  the sidewalk before vanishing. Include a matching graph node `outside`
  at `(0, 0, 12)` linked to `entrance`.
- **The entrance must be a real opening, not just a door texture.** Build the
  floor-0 front wall from separate left/right wall segments (and any header
  trim separately) so there is no wall mesh, invisible collider, or furniture
  blocking a clear doorway at least 3 units wide centered on `x = 0`. If you
  draw glass doors, they must be open or visual-only; agents must be able to
  pass through the threshold from the sidewalk into the lobby.
- Add explicit entrance navigation nodes:
  `outside` at `(0, 0, 12)`, `front_door_threshold` at `(0, 0, 9.35)`,
  `entrance` just inside the lobby at `(0, 0, 7.4)`, and
  `lobby_center` on the clear path toward the elevator. Link them in order:
  `outside <-> front_door_threshold <-> entrance <-> lobby_center`.
  Do not route arriving agents to a point on the exterior wall and call it
  done; they must cross the threshold before requesting elevators, visiting
  the cafe, or loitering.
- **Cafe**: counter on the left wall (coffee machine, pastry display) +
  ~4 bistro tables with chairs, a `cafe_order` standing waypoint at the
  counter.
- **Front lounge**: couch + armchairs + coffee table (right side).
- **Back lounge** (Z < 0): two couches facing each other across a coffee
  table (`back_lounge_N`, `back_lounge_S`).
- **Conversation pit** (back-left): a round table surrounded by four
  armchairs (`pit_N`, `pit_S`, `pit_E`, `pit_W`).
- **Two water coolers** with standing waypoints (`lobby_wc_front`,
  `lobby_wc_back`).
- **Reception desk** tucked off to the side so it doesn't block the walk
  from entrance to elevator, plus a `reception` standing waypoint.
- **Info kiosk** near the entrance (`kiosk` standing waypoint).
- **Generic loiter waypoints** scattered through the lobby
  (`lobby_stand_center`, `lobby_stand_NE`, `lobby_stand_NW`,
  `lobby_stand_midE`, `lobby_stand_midW`, `lobby_stand_entry`) so
  visitors spread out rather than piling up.
- A potted plant / two by the entrance for flavor.

Each office floor also gets a **`water_cooler`** standing waypoint near
the lounge cooler and two **`hall_stand_N` / `hall_stand_S`** hallway
loiter spots, so visitors can ride up and "be somewhere" without
hogging a lounge chair.
- **Cafe** on the left: a counter (box with a darker "countertop"), a
  coffee machine and pastry display on the countertop, and a couple of
  bistro tables with two chairs each.
- **Lounge** on the right: a couch, a coffee table, two armchairs, a water
  cooler, a potted plant by the entrance.
- **Small reception desk** tucked off to the side (`x approx. -3`, `z approx. 6`) so it
  doesn't block the walk from entrance to elevator.
- The same call panel + shaft indicator as on other floors.

### Navigation graph

Expose `bfsPath(nodes, fromName, toName)` returning an array of `Vector3` way-
points. Each floor has its own graph sharing a **hallway ring** around the
shaft: `hallS, hallSE, hallE, hallNE, hallN, hallNW, hallW, hallSW`, plus an
`elevWait` node directly in front of the doors (linked to `hallS`).

- On office floors, each office door (`officeA_door`..`officeD_door`) links
  to the nearest hallway corner, and each door links to its desk
  (`officeA_desk`..`officeD_desk`).
- Conference room: `conf_door` <-> `hallSW`, `conf_door` <-> `conf_center`,
  `conf_center` <-> `conf_seat0..3`.
- Lounge: `lounge_door` <-> `hallSE`, linked to `lounge_spot0..2` via
  `lounge_center`.
- Lobby: add `outside`, `front_door_threshold`, `entrance`, and
  `lobby_center` nodes. Link `entrance` / `lobby_center` directly to
  `elevWait` - avoid routing through `hallS` and back again. Also add
  `cafe_door` <-> `hallSW`, bistro chair nodes, lounge chair nodes, etc.

For each "sittable" waypoint, publish a `sitTargets[wpName] = {sit, facing}`
entry recording whether the agent should play the sitting animation and what
`rotation.y` to face. Make sure the facing matches the chair's orientation
(e.g. office-desk chairs have `rotation.y = Math.PI` so the seat opens toward
the monitor; the person faces the monitor (`Math.PI`)).

### Call panel

Each call panel is a plate (approx. 0.55 x 1.4 x 0.05) with an up-arrow and
down-arrow (flat `ShapeGeometry` triangles, approx. 0.13 half-width) and a
approx. 0.45-square canvas-texture floor display. These sizes are deliberately
chunky - the camera typically sits 20+ units away, and smaller panels
turn into unreadable specks.

Expose `panel.userData` with:
- `setUp(on)`, `setDown(on)` - swap the triangle's material between an
  unlit dark gray and a bright green "emissive" glow.
- `setIndicator(text)` - rewrite the canvas and flag the texture dirty.

Render the digits on a near-black canvas with a hot orange foreground
(`#ffbb22` on `#050505`), the glyph filling ~82% of the canvas, plus a
`shadowBlur` bloom to simulate glow. Use a 256-px canvas, `LinearFilter` +
mipmaps + anisotropy for crisp zooming.

**Cache the last-rendered text** on the texture (`tex._lastText`) and
early-out in `updateTextTexture` if unchanged - otherwise you reupload
the canvas to the GPU every frame.

The building-side **shaft indicator** (mounted above the doors) uses the
same texture style but on a larger `PlaneGeometry(0.9, 0.9)`. The
**in-car indicator** (above the doors looking back at the passengers) is
`PlaneGeometry(0.6, 0.6)`.

### Export

```js
function createWorld(scene) {
    // ...build everything, add to scene via a buildingGroup...
    return {
        buildingGroup,
        floors: [
            { floorNumber, nodes, callPanel, shaftIndicator, desks,
              sitTargets, /* lobby-only: entranceSpot, cafeSpots, etc. */ },
            ...
        ],
        bfsPath,
    };
}
```

---

## `elevator_logic.js` - pure scheduler/state machine

This file is the authoritative elevator brain. It must have **no Three.js,
DOM, canvas, or browser-only dependencies** so it can run under Node.js.
`elevator.js` is only the visual adapter. All target selection, direction
handling, calls, destinations, capacity, pending boarders/disembarkers, and
door timing live here.

Export for both browser globals and Node tests:

```js
(function(root) {
    class ElevatorLogic { /* ... */ }
    root.ElevatorLogic = ElevatorLogic;
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { ElevatorLogic };
    }
})(typeof window !== "undefined" ? window : globalThis);
```

Expose a `class ElevatorLogic` with constructor options such as
`{ floorCount = 6, maxCapacity = 4, floorHeight = 3.4 }`. The public API
mirrors the visual elevator API:

- `callUp(floor)`, `callDown(floor)` - add to `upCalls` / `downCalls`.
- `pressDestination(floor)` - add to `destinations`.
- `isAcceptingAt(floor, direction)` - true only when the car is at `floor`
  in `DOOR_OPEN` state AND either there are no more stops pending in the
  current direction OR the caller's direction matches the car's.
- `currentCapacityFree()` - `maxCapacity - (passengers.size + pendingBoarders.size)`.
- `reserveBoardingSpot(person)` - if capacity is available, reserve one of
  four logical interior spots, add to `pendingBoarders`, and return a plain
  object like `{index, x, y, z}`. Return `null` if full.
- `completeBoard(person)` - move from `pendingBoarders` to `passengers`.
- `registerDisembark(person)` / `completeDisembark(person)` - same pattern
  for getting out; release the logical interior spot.
- `tick(dt)` - one-frame advance of the state machine.
- `reset()` - clear calls, destinations, passengers, pending sets, direction,
  target, spot occupancy, door timers, and park at floor 0 with doors closed.

**State machine** (use exactly these five states):
`IDLE -> MOVING -> DOOR_OPENING -> DOOR_OPEN -> DOOR_CLOSING -> (IDLE or MOVING)`.

**SCAN scheduling and anti-starvation rules**:

- Maintain `direction in {+1, 0, -1}`, `currentFloor`, and `targetFloor`.
- At each door-close -> pick-next-target transition, prefer continuing in
  the current direction: nearest destination or matching-direction hall call
  ahead. If no work remains ahead, reverse direction and look behind. If
  idle, pick the nearest active call/destination and infer direction.
- At each door-open arrival, clear `destinations` for that floor and clear
  the served hall call for the current direction. If no more stops exist in
  the current direction, also clear the opposite-direction call at this floor
  so it can be served before leaving.
- **Passenger destinations outrank same-floor hall calls.** If
  `passengers.size > 0 && destinations.size > 0`, door-close target
  selection must choose a passenger destination instead of reopening for a
  same-floor hall call.
- **No full-car lobby starvation.** If the car is full or has passenger
  destinations, repeated calls from the current floor must remain queued for
  the next trip but must not cause `DOOR_CLOSING -> DOOR_OPENING` at the same
  floor. This is especially important on floor 0 during the morning rush,
  where leftover lobby waiters keep pressing UP after four riders board.
- Add a `servedThisDoorCycle`, `lastServedFloor`, or equivalent guard so the
  same floor cannot reopen indefinitely while destinations exist.
- Re-evaluate target during `MOVING`: each frame, scan for a closer stop in
  the same direction and shorten `targetFloor` if appropriate.
- Door open logic: doors only close when both pending sets are empty and
  `MIN_DOOR_OPEN_S` has elapsed; also enforce `MAX_DOOR_OPEN_S` as a safety
  cap.

---

## `elevator.js` - Three.js car + adapter around `ElevatorLogic`

`elevator.js` owns only geometry, meshes, doors, indicators, panel lights,
and converting logical interior spots into `THREE.Vector3` targets. It must
instantiate `new ElevatorLogic(...)` and delegate scheduling/state decisions
to it. Keep the public class name `Elevator` so `sim.js` can call
`new Elevator(scene, world)`.

### Car geometry

- Yellow semi-transparent frame (opacity 0.5) - floor, ceiling, side walls,
  solid back wall (opaque yellow).
- Two sliding doors on the `+Z` face, each half the car width, slightly more
  opaque than the frame (0.7). Closed: they meet at `x=0`. Open: each half
  slides outward by ~(car width / 2 - small gap).
- A destination panel on the back-right wall with one small glowing
  cylinder button per floor. Store button references so individual buttons
  can light up / dim.
- A small canvas-texture floor indicator mounted above the doors from the
  INSIDE of the car, so riders can see the current floor.
- `renderOrder = 1` on all car meshes (so they draw after the building).

### Adapter class

Expose a `class Elevator { constructor(scene, world) {...} }` that wraps
`ElevatorLogic` and keeps these same public methods for `sim.js`:

- `callUp`, `callDown`, `pressDestination`, `isAcceptingAt`,
  `currentCapacityFree`, `reserveBoardingSpot`, `completeBoard`,
  `registerDisembark`, `completeDisembark`, `tick`, and `reset`.
- Mirror/read through logic state such as `state`, `direction`,
  `currentFloor`, `targetFloor`, `upCalls`, `downCalls`, `destinations`,
  `passengers`, `pendingBoarders`, and `pendingDisembark` so the HUD can
  display them.
- On each `tick(dt)`, advance `ElevatorLogic`, then update car `position.y`,
  sliding doors, call-panel lamps, destination buttons, and floor indicators.

Do not duplicate target-selection logic in `elevator.js`; if there is a
scheduling bug, it should be fixable in `elevator_logic.js` and covered by
`elevator_logic_test.js`.

---


## `elevator_logic_test.js` - deterministic Node tests

Create a no-dependency test file that runs with:

```bash
node elevator_logic_test.js
```

Use only Node built-ins such as `assert`. Do not require npm, Jest, Mocha, a
browser, Three.js, or a build step. The file should import the logic with:

```js
const assert = require("assert");
const { ElevatorLogic } = require("./elevator_logic.js");
```

Include small helper functions such as `tickUntil(stateOrPredicate)`,
`runUntilDoorOpenAt(floor)`, and `runUntilDoorClosed()` with iteration caps so
tests fail instead of hanging forever. Tests should be deterministic: no
randomness, no real timers.

Required test scenarios:

1. **Lobby rush with more callers than capacity** - create a floor-0 UP call,
   open the doors, board exactly four people, press upper-floor destinations,
   then simulate leftover lobby callers re-pressing UP. After doors close, the
   next target must be above floor 0, not floor 0 again.
2. **Passenger destinations outrank same-floor hall calls** - with
   `passengers.size > 0` and `destinations` non-empty, adding a same-floor
   hall call must not cause an immediate reopen at the same floor.
3. **Repeated hall-call pressing cannot starve riders** - repeatedly call
   `callUp(0)` across several ticks while riders have destinations; assert the
   car still reaches at least one passenger destination.
4. **Opposite-direction calls wait their turn** - while moving UP with work
   above, a DOWN call at the current or lower floor should not reverse the car
   until upward destinations/calls have been served.
5. **Door hold and safety cap** - doors remain open while
   `pendingBoarders` or `pendingDisembark` are non-empty after the minimum
   open time, but close after `MAX_DOOR_OPEN_S` if something never completes.
6. **Destination preserved across the action handshake** - model the logical
   sequence `WAIT_AT_PANEL -> ENTER_ELEVATOR -> PRESS_FLOOR -> WAIT_FOR_FLOOR`
   for a rider going from floor 0 to floor 5. The test should catch designs
   that only store direction and accidentally treat the target as floor 1.
7. **Reset clears phantom state** - `reset()` must clear calls, destinations,
   passengers, pending sets, spot occupancy, direction, target floor, and door
   timers.

At the end, print a compact PASS/FAIL summary and exit nonzero if any test
fails. After generating the files, run `node elevator_logic_test.js` and fix
failures before finishing.

---

## `sim.js` - clock, agents, day/night, render loop

### Scene setup

Create a `THREE.Scene`, `PerspectiveCamera` at `(28, 24, 28)` looking at
the building center, `WebGLRenderer({antialias:true, alpha:true})` with
`sortObjects = true`, `OrbitControls`, an `AmbientLight`, a
`DirectionalLight` (the "sun"), and a `HemisphereLight`. Instantiate
`createWorld(scene)` and `new Elevator(scene, world)`.

Use this render bootstrap shape in `sim.js` and preserve it while adding
agent behavior. Do not omit the canvas append, lights, controls update,
render call, or top-level startup call:

```js
function startSimulation() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(28, 24, 28);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.sortObjects = true;
    document.body.appendChild(renderer.domElement);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    scene.add(new THREE.HemisphereLight(0xbfd7ff, 0x303020, 0.45));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(20, 35, 18);
    scene.add(sun);
    world = createWorld(scene);
    elevator = new Elevator(scene, world);
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", startSimulation);
} else {
    startSimulation();
}
```

### Simulated clock

A `Clock` object owning:
- `simMinute` - minutes since midnight. Start at `7*60 + 30` (07:30).
- `timeScale` - **pure real-time multiplier.** 1x means one real second
  advances one sim second, so walks, elevator cycles, and the clock all
  tick in lockstep. Default `120` (approx. 5.5 min to play a whole workday);
  expose a log-spaced slider covering at least `1..600`.
  - **Do NOT decouple sim time from physical motion** (an earlier version
    used "N sim minutes per real second" with motion clamped slower; this
    is what causes morning/evening elevator bottlenecks where the clock
    races past the car's capacity to serve people).
- `tick(realDt)` - advance `simMinute` by `realDt * timeScale / 60`. On
  wrap past `24*60`, **reset both the agents AND the elevator** -
  re-initialize every agent with a fresh random schedule (arrival / lunch /
  departure times, `hasLunched = false`, `plannedMeetingTimes`, clear seat
  reservations), AND clear every elevator set (`upCalls`, `downCalls`,
  `destinations`, `passengers`, `pendingBoarders`, `pendingDisembark`),
  reset `spotOccupancy`, snap doors to closed, and park the car on floor 0.
  Forgetting to reset the elevator leaves phantom passengers that jam the
  scheduler on the next day.
- `format()` - `" 9:24 AM"`.

### Day / night

Interpolate scene background color, sun color + intensity, ambient
intensity, and hemi intensity across ~9 keyframes anchored at specific
hours. Shape the curve like a real day: **long flat daytime**, with the
transitions compressed into a narrow "golden hour" at dawn (~06:00-06:30)
and dusk (~17:30-18:30). Don't spread the ramp over 2-3 hours - real
daylight is bright from shortly after sunrise until shortly before
sunset, then transitions quickly.

**Night must not be pitch black** - keep `ambientIntensity approx. 0.45` and
`hemiIntensity approx. 0.32` so the building geometry and transparent walls
stay readable. (My first cut had night at `ai=0.22, hi=0.15` and the
whole interior disappeared.)

### Agents - two roles

The building supports **two roles**:

- **Workers** (`MAX_WORKERS = 20`) - one per desk. Full daily schedule
  (arrive morning, work, lunch, work, depart evening). Fixed count; can't
  exceed the number of desks.
- **Visitors** (`MAX_VISITORS = 80`) - deliveries, clients, job
  candidates, wanderers. They don't have a desk. Each one does a short
  visit plan and leaves, then is **recycled** by the top-up scheduler
  for another visit later the same day. This is what lets 80 visitor
  slots sustain dozens of concurrent visitors all day.

Together: `MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS = 100`,
`DEFAULT_OCCUPANCY approx. 45`.

Always build the **full pool** at startup so roles + desk assignments
stay stable; the slider moves agents between `AWAY` (normal lifecycle)
and a parked `DISABLED` state (invisible, never spawns, skipped by
collision and the render-loop dispatch).

**Critical - the dynamic top-up:** a naive "one arrival per visitor per
day" model looks empty even at the top of the slider, because each
visitor only occupies the building for a fraction of the day. Fix it
with a frame-tick `topUpVisitors()` that runs during business hours:

```
deficit = targetOccupancy - countPresent()
if deficit > 0:
    for visitor in agents where role=='VISITOR' and state in {AWAY, GONE}:
        re-roll arrivalTime = now + randInt(0, 6)   // minutes
        re-roll visitDuration
        state = AWAY
        break when we've re-armed `deficit` of them
```

So visitors cycle continuously: arrive -> visit -> leave -> brief gap ->
arrive again. The slider becomes a meaningful "how full is the building
right now" knob rather than "how many unique agents today."

Per-agent fields:
- `role` (`WORKER` | `VISITOR`).
- `name` (random short first name). Workers also have `homeFloor`,
  `deskId` (plus derived `deskWpName`, `deskDoorWpName`); visitors leave
  those null.
- **Daily schedule** (resampled on each new simulated day, and for
  visitors also re-rolled by the top-up scheduler each time they're
  recycled):
  - `arrivalTime` - `8:15..9:30`
  - `lunchTime` - `11:30..13:30` (window, not exact)
  - `lunchDuration` - `25..60` minutes
  - `departureTime` - `16:45..18:30`, or with ~15% probability a
    "straggler" window `18:30..19:45`
  - `plannedMeetingTimes` - 0..2 pre-scheduled meeting minutes (one morning,
    one afternoon)
- `state` (`DISABLED` | `AWAY` -> `ARRIVING`/`WAITING_ELEVATOR`/`IN_CAR`/
  `ON_FLOOR`/`AT_DESK`/`IN_MEETING`/`AT_BREAK`/`AT_LUNCH`/`VISITING`/
  `LEAVING`/`GONE`)
- `plan` (queue of primitive actions), `currentAction`.

### Primitive actions

All plans compile down to a sequence of these:
- `WALK_TO_WP(floor, wpName)` - BFS a path from the agent's current world
  position to the named waypoint on that floor; walk segment by segment.
- `WAIT_AT_PANEL(floor, dir, toFloor)` - press the up/down call and stand still
  until the car is `DOOR_OPEN` at this floor with matching direction AND has
  capacity. Re-press the call every frame if it's missing (in case another
  direction's cycle cleared it). Preserve `toFloor`; do not infer the rider's
  destination as `floor + dir`.
- `ENTER_ELEVATOR(toFloor)` - phased: reserve a spot (re-call if the car
  slipped away); walk into the door threshold in world space; reparent scene ->
  car; walk to the reserved interior spot in car-local space; `completeBoard`
  and turn to face the doors (`rotation.y = 0`). Preserve `toFloor` through
  the boarding action.
- `PRESS_FLOOR(floor)` - symbolic; lights the in-car button. This should be
  the exact destination from the plan compiler, not a value recomputed from
  direction.
- `WAIT_FOR_FLOOR(floor)` - stay put until the car is `DOOR_OPEN` at `floor`.
- `EXIT_ELEVATOR(toFloor)` - reparent car -> scene (preserving world pos,
  and `registerDisembark` to hold the doors); walk to `elevWait` on the
  target floor; `completeDisembark`.
- `SIT(floor, wpName)` - snap to the sit-spot, apply the target facing,
  set `isSitting = true`, and **lower the body y by ~0.35** so the hips
  align with the chair seat rather than floating above it.
- `STAND()` - clear sitting flag, restore y to floor height (or 0 if inside
  the car). **Do NOT release a seat reservation here**; STAND is also
  called at the start of a plan (to rise from a desk), long before the
  agent reaches the reserved seat. Release goes in `RELEASE_SEAT`.
- `RELEASE_SEAT()` - explicit release, placed in the plan AFTER the post-
  meeting `STAND()`.
- `WAIT_SIM(minutes)` - resolve `untilMin` in `startAction` (not at plan
  compile time!), then idle until `Clock.simMinute >= untilMin`.
- `EXIT_BUILDING()` - remove the person from the scene graph; state = GONE.
- `ENTER_STATE(state)`, `MARK_LUNCHED`, `PICK_NEXT_ACTIVITY` - zero-duration
  bookkeeping actions.

### Goal -> plan compilers

Each of these returns a list of primitive actions. They end with
`WAIT_SIM(random minutes)` + `PICK_NEXT_ACTIVITY` so the agent loops into
its next decision naturally.

- `planArriveToDesk` - outside sidewalk -> `front_door_threshold` -> entrance
  -> lobby center -> elevator up to home floor -> office door -> desk -> sit
  -> work for a while -> decide next.
- `planGoToLunch` - from desk: office door -> elevator down to lobby -> bistro
  chair -> sit and eat for `lunchDuration` -> `MARK_LUNCHED` -> elevator back
  up -> back to desk.
- `planVisitLounge` - brief trip to the lounge on the same floor for ~5-12
  minutes.
- `planAttendMeeting` - pick a meeting floor (65% home floor, else random
  1..5); travel there; sit in a conference seat for 22-45 minutes; return
  to own desk.
- `planVisitCoworker` - pick a random agent currently `AT_DESK`; walk (or
  ride) to stand by their office door for 6-18 minutes; return.
- `planLeaveBuilding` - end-of-day for workers: office door -> elevator
  down -> lobby center -> entrance -> `front_door_threshold` -> outside
  -> `EXIT_BUILDING`.
- `planVisitorVisit` - for visitors only. Walk in from sidewalk, roll a
  weighted die to pick one activity, do it, leave. Roughly-tuned weights
  that keep any single venue from dominating:
  - ~10% bistro table (cafe)
  - ~6%  cafe counter
  - ~14% front lounge
  - ~12% back lounge / conversation pit
  - ~10% reception / kiosk / water cooler (stand briefly)
  - ~10% lobby loiter
  - ~15% ride up to an office-floor lounge
  - ~23% **sit in on a meeting** in a random floor's conference room -
    the "external attendee / client" archetype. Reserve a seat via
    `reserveConfSeat`; if all four are taken, fall back to a lobby
    loiter. Remember the trailing `RELEASE_SEAT` at the end of the
    meeting sub-plan.

  Then `WALK_TO_WP('lobby_center')` -> `WALK_TO_WP('entrance')` ->
  `WALK_TO_WP('front_door_threshold')` -> `WALK_TO_WP('outside')` ->
  `EXIT_BUILDING`. Workers' end-of-day override must check `role`:
  visitors run their own plan to completion; don't replace it.

  These weights were tuned deliberately - bistro + cafe counter at 22%
  total in an early version made the snack bar feel like the center of
  the universe while the conference rooms stayed empty. Keep the
  meeting slice generous or the building reads as "all cafe, all day."

### `chooseNextActivity(agent)` decision rules

At a desk-level decision point, check in this order:
1. Past departure time -> `planLeaveBuilding`.
2. Any planned meeting whose time has arrived -> remove it from the list,
   `planAttendMeeting`.
3. Past lunch window and `!hasLunched` -> `planGoToLunch`.
4. Otherwise roll a weighted die:
   - ~14% ad-hoc meeting (`MEETING_PROB approx. 0.36`, gated by a 0.4 factor)
   - ~12% lounge break
   - ~15% visit a coworker
   - rest: `WAIT_SIM(18..65 min)` + another decision later (keep working).

The meeting weight is deliberately generous - without it, conference
rooms sit empty most of the day and the lounge couches do all the
visible "work."

### Render loop

Each frame:
1. `realDt = min(0.05, clock.getDelta())`. Advance the sim clock.
2. Update lighting from current sim time.
3. `motionDt = realDt * timeScale` - motion and sim clock advance together.
   Don't try to clamp this below `timeScale`: the whole point of the
   lockstep model is that the elevator scales up just as fast as the
   morning rush it needs to serve. At 1x an agent walks at ~1.3 m/s; at
   120x the same trip plays out 120x faster.
4. `elevator.tick(motionDt)`.
5. For each agent, process daily schedule (spawn if `AWAY` and arrived;
   replan to `planLeaveBuilding` if past departure and not already heading
   home; run the action dispatch loop).

   **Action dispatch must loop within one frame** (up to ~16 iterations) so
   zero-duration actions (SIT, STAND, PRESS_FLOOR, ENTER_STATE, etc.) hand
   off to the next action immediately. Without this, there's a one-frame
   gap where nothing is registered as pending-disembark and the elevator
   may close its doors on a passenger who was about to step out.
6. `applyCollisions()` - O(n^2) soft repulsion between agents sharing the
   same parent within ~1 unit of Y and ~0.7 of XZ. Skip sitting agents
   **and skip any agent currently parented to the elevator car** - the
   car's 4 interior spots are pre-assigned, so applying repulsion inside
   the tiny 3x3 cabin makes boarders oscillate forever (the "twitching
   legs" bug). Use a low push scalar (~0.18) so a walking agent can still
   make progress past a stationary body.
7. `animatePersonWalking(agent.group, motionDt)` for each agent still in
   the scene graph.
8. `controls.update(); renderer.render(scene, camera); updateHUD();`

### UI

Top-left HUD panel with:
- Large simulated-time display (`" 9:24 AM"`).
- **Speed slider** - log-spaced stops across `1..600`x realtime.
- **Occupancy slider** - linear `1..MAX_OCCUPANCY` (= 100), labeled
  "Occupancy: N / 100 people". On input:
  - Set `targetOccupancy = slider.value`.
  - Call `applyOccupancy()`: for each agent, flip `DISABLED <-> AWAY`
    based on `agent.id < targetOccupancy`. Agents that are already in
    the middle of a workday (AT_DESK, IN_CAR, etc.) are left running -
    they'll finish naturally, reach `GONE`, and only be parked
    `DISABLED` on the next day-wrap. This keeps the slider responsive
    without yanking people mid-walk.
  - The day-wrap reset must also honor `targetOccupancy` when deciding
    which agents come back for the new day.
  - The **`topUpVisitors()` tick** (called each frame from the render
    loop) then keeps the concurrent population at the slider value by
    re-arming AWAY / GONE visitors with a new arrival ~0-6 sim-minutes
    out whenever `countPresent() < targetOccupancy`.
- Live state breakdown: counts of agents per state; elevator's current
  floor, direction, state, passenger count, destination set, up-calls,
  down-calls.

---

## Rendering rules (don't let transparency bite you)

- `renderer.sortObjects = true`, `alpha: true` on the renderer.
- **Every** transparent material sets `depthWrite: false` and `side:
  THREE.DoubleSide`.
- Building gets `renderOrder = 0`, elevator car + its children get
  `renderOrder = 1` so the car draws after the building.

---

## Tuning / verification pass

While implementing and testing, explicitly check for these issues and fix them:
- **Text textures re-uploading every frame** -> cache `_lastText` on the
  canvas texture.
- **Elevator overshoots a closer stop** -> re-evaluate target in
  `ElevatorLogic.tick()` while MOVING, not only at door-close.
- **Full lobby car never leaves floor 0** -> same-floor lobby UP calls from
  leftover waiters must not outrank in-car destinations. This must be covered
  by `elevator_logic_test.js`.
- **Riders board for floor 5 but the action code thinks their destination is
  floor 1** -> carry `toFloor` explicitly through the elevator primitive
  actions; do not reconstruct destination from direction alone. This must be
  covered by `elevator_logic_test.js`.
- **Waiting agents show `WAITING_ELEVATOR` but no active call exists** ->
  `WAIT_AT_PANEL` must re-press the correct hall call every frame until
  accepted, and tests should catch stale/cleared call state.
- **An agent waiting to board gets stranded when the car leaves** -> in the
  `reserve` phase of `ENTER_ELEVATOR`, re-press the call if the car has
  already left.
- **A passenger's `WAIT_FOR_FLOOR` completes but their `EXIT_ELEVATOR`
  starts next frame, doors close on them** -> action dispatch must loop
  multiple transitions per frame.
- **`WAIT_SIM` durations feel wrong** -> resolve `untilMin` in
  `startAction`, not at plan compile time.
- **People standing on top of their chairs** -> drop the body by ~0.35 on
  `SIT`, restore on `STAND`.
- **Boarders converge at the same door threshold and push each other
  around** -> when an agent reserves a spot, aim their walk-to-door at
  the `spotWorld.x` X-coordinate (not `x=0`), so each of the 4 boarders
  enters on their own lane.
- **People bunch outside the front door and never enter** -> this means the
  entrance is only decorative or the navigation graph stops at the wall.
  The floor-0 front wall must have a real 3+ unit physical gap centered on
  `x=0`, and the arrival path must include
  `outside -> front_door_threshold -> entrance -> lobby_center`. During
  `WALK_TO_WP` for the entrance chain, exempt agents from crowd collision
  against other agents until they clear the threshold into the lobby. If an
  arriving or leaving agent makes <0.005/frame of progress near
  `front_door_threshold` for >1.5 motion-seconds, advance it to the next
  entrance waypoint. A screenshot where multiple people remain outside the
  door for several simulated seconds while nobody crosses into the lobby is
  a failed implementation, even if the rest of the building renders.
- **Two agents walk to the same conference seat and oscillate** -> maintain
  a `seatReservations` Set keyed by `"floor:wpName"`; reserve at plan
  compile time, release via an explicit `RELEASE_SEAT` action AFTER the
  post-meeting `STAND` (not inside `STAND` itself - the opening `STAND`
  of the plan would otherwise release the reservation before the agent
  even starts walking). Also release in the end-of-day override and on
  day-wrap. If all four seats are already reserved, fall back to a lounge
  break plan.
- **Legs twitch in place while an agent is blocked** -> in the walk loop,
  track `_prevWp` / `_stallT`; if the agent makes <0.005/frame of
  progress for >1.2 seconds of motion time, skip the current waypoint and
  advance the path index.
- **Two agents occupy exactly the same spot (no personal space)** ->
  three fixes layered together:
  1. On `SIT` with a **standing** waypoint (target.sit === false), jitter
     position by a small random ring (radius 0.35-0.75) so two visitors
     assigned to the same lobby loiter waypoint don't snap to identical
     coordinates.
  2. On **spawn at entrance**, jitter X/Z by +/-1.1 / +/-0.75 - visitors
     often arrive in the same frame via the top-up scheduler and would
     otherwise pile up on the sidewalk.
  3. In the collision resolver, handle the `d < 1e-3` case (exact
     overlap) by picking a random separation direction instead of the
     normal gradient - otherwise the bodies have no push axis and stay
     stuck in each other.
- **Elevator gets stuck with boarders unable to reach it in a crowded
  lobby** -> once the lobby has dozens of loitering visitors, a boarder
  walking toward the open doors gets pushed around by collision and
  never arrives, so doors stay open (held by `pendingBoarders.size > 0`)
  until `MAX_DOOR_OPEN_S` fires. Two fixes together:
  1. **Collision exemption for boarders** - in `applyCollisions()`, skip
     any agent whose `currentAction.type === 'ENTER_ELEVATOR'`. They
     have a reserved spot and must be allowed to push through the crowd.
  2. **Stall-recovery in `walkToDoor`** - track `_prevWalk` / `_stallT`
     inside the ENTER_ELEVATOR action just like `walkAlongPath` does.
     After ~1.5 motion-seconds of no progress, teleport the agent to the
     threshold to force-complete the phase.
- **Morning traffic jam** - expected mild queuing! With 19 agents arriving
  in a ~105-min window and capacity 4, the lobby should briefly queue
  during peak arrival and peak departure. The elevator should cycle
  several times per batch. That's the goal, not a bug.

---

## Final self-check before you stop

Before reporting completion, verify these concrete things:
- `index.html` creates a canvas and the browser console has zero startup
  `SyntaxError`, `ReferenceError`, or `TypeError` messages.
- `person.js`, `world.js`, `elevator.js`, and `sim.js` contain no top-level
  `import` or `export` statements.
- `index.html`, `person.js`, `world.js`, `elevator.js`, and `sim.js` contain
  no `file://` URLs, no `summary.html` references, and no `<iframe>`,
  `<object>`, or `<embed>` tags.
- `node ../../static_check.js .` reports no static errors.
- `node ../../runtime_check.js .` reports no startup, canvas, animation, or
  browser page errors.
- Shared identifiers are spelled consistently and are not duplicated across
  classic browser scripts.
- The floor-0 front wall is not a single solid box across the entrance; it is
  split so a clear 3+ unit doorway exists at the front center.
- No collision mesh, glass-door mesh, desk, plant, kiosk, or invisible helper
  spans the doorway.
- The navigation graph contains
  `outside -> front_door_threshold -> entrance -> lobby_center`, and arriving
  agents visibly cross from sidewalk to lobby before doing anything else.
- Let the sim run for several seconds: if people collect outside the door and
  nobody enters the lobby, fix that before submitting.

---

## Expected behavior

When the page loads you should see:
- A transparent 6-floor building with a central shaft, semi-transparent
  walls, visible offices, conference rooms, lounges, and a ground-floor
  lobby with a cafe and seating.
- A yellow elevator car with sliding doors, a glowing destination panel on
  the back wall, and a floor indicator above the doors.
- Call panels on each floor with up/down arrow lamps and a digital floor
  display.
- A time-of-day readout that advances at 120x realtime by default (approx. 5.5
  real minutes per simulated workday), with background sky color, sun
  intensity, and ambient lighting shifting through dawn / day / dusk /
  night.
- People arriving one or two at a time starting around 8:30 AM, queueing in
  the lobby, riding up in groups of up to four, dispersing to their
  offices, sitting at desks (body dropped to chair height, legs bent
  forward).
- Occasional mini-trips: someone gets up, walks to the lounge for a few
  sim-minutes, comes back; two or three people head to a conference room
  for a meeting; a coworker wanders to another desk and stands for a chat.
- A broad lunch surge around 11:30-13:30 where some agents ride down to the
  lobby cafe, sit at a bistro table, then ride back up.
- An end-of-day exodus around 5 PM with down-calls on every occupied
  floor; a couple of stragglers staying until 18:30-19:45.
- No agents colliding or overlapping (soft separation nudges them apart).
- No z-fighting or disappearing surfaces as the camera rotates.

After generating all files, read each one back to verify nothing is
truncated or malformed. Run `node elevator_logic_test.js`; if it fails, fix
the implementation and run it again before finishing.
