# Office Building Simulation — One-Shot Prompt

Use the agentic coding tools available to you to write files that implement a
3D simulation of an office building and its inhabitants, running entirely in
the browser with no build process (Three.js 0.128.0 loaded from a CDN).

The simulation must not simply be "an elevator moves people between floors."
It must read as **a day in the life of a small office**, expressed through
persistent agents that pursue human goals on a simulated clock: arriving for
work, sitting at a desk to work, getting up for meetings or a chat at a
coworker's desk, breaking for lunch, drifting home around 5 PM (with a couple
of stragglers staying later), while a realistically-scheduled elevator car
ferries them up and down with proper call buttons, direction handling, and a
hard capacity limit.

Visual fidelity should be modest — simple Three.js primitives with semi-
transparent surfaces so the viewer can see through walls and follow agents.
The emphasis is on **behavioral fidelity**: the elevator acts like a real
elevator; the people act like real office workers.

---

## Files

Split the code across four JavaScript files plus an HTML shell, loaded in
this exact order:

1. `person.js`  — person mesh factory + walk/sit animation
2. `world.js`   — building geometry, per-floor layouts, furniture, navigation graph, call panels
3. `elevator.js` — elevator car + SCAN-style scheduler + in-car destination panel
4. `sim.js`     — simulated clock, day/night lighting, agent state machine + daily schedules, render loop, UI
5. `index.html` — loads Three.js + OrbitControls + the four scripts in order

All files use global variables on `window` (no ES6 modules). No build step.

### `index.html`

```html
<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Office Building Simulation</title>
<style>html,body{margin:0;padding:0;overflow:hidden;background:#222233}canvas{display:block}</style>
</head><body>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
<script src="person.js"></script>
<script src="world.js"></script>
<script src="elevator.js"></script>
<script src="sim.js"></script>
</body></html>
```

Exact URLs and order are mandatory — OrbitControls depends on the global
`THREE` being defined first; the other scripts depend on each other in order.

---

## Coordinate conventions

- `+Y` is up. `+Z` is the front of the building (entrance side; elevator doors
  face `+Z`). `+X` is right.
- Floor `N` has its walkable floor at world `y = N * FLOOR_HEIGHT`.
- The shaft is a 3×3 column centered at `x=0, z=0`, extending top-to-bottom.
- Floor `0` is the ground-floor **lobby**; floors `1..FLOOR_COUNT-1` are
  **identical office floors**.

---

## `person.js`

Export a factory `createPerson({bodyColor?, skinColor?, legColor?})` returning
a `THREE.Group`. Body is assembled from primitives so **feet sit at local
y=0** (the person's origin). Structure bottom-to-top: legs → torso → head,
with arms at shoulder level.

- Each leg is its own `THREE.Group` pivoting at the **hip** (group origin at
  hip, cylinder hanging below). Arms pivot the same way at the shoulder. This
  makes walk animation a simple `rotation.x` tween at the pivot.
- Add a small hemisphere "nose" on the `+Z` face of the head so facing
  direction reads from a top-down camera.
- Sample colors from three small palettes (shirts, skin tones, pants) so the
  agents are visually distinct at a glance.

Export a per-frame animator `animatePersonWalking(person, dt)`:
- If `userData.isSitting`: legs rotate `-π/2` at the hip (feet forward), arms
  drop to `-π/4`, walk phase resets.
- Else if `userData.isWalking`: advance `walkPhase += dt * 8`; legs swing
  with `sin(phase) * 0.6`, arms with `-sin(phase) * 0.5` (opposite) for a
  natural gait.
- Else: reset limbs to zero rotation (standing idle).

---

## `world.js` — building + floors + navigation

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

### Per-floor layout (floors 1..5 — identical)

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

### Ground floor (`floor 0`) — lobby

The lobby is deliberately busy — plenty of places for visitors to sit,
stand, and loiter. Contains:
- **Entrance** at front center (a pair of semi-transparent glass doors at
  `z = +9`, with the 3-unit gap in the outer wall). Agents spawn on the
  **sidewalk** (a concrete-colored slab outside the front wall at
  `z ≈ +12`) and walk IN through the doors — and similarly walk OUT onto
  the sidewalk before vanishing. Include a matching graph node `outside`
  at `(0, 0, 12)` linked to `entrance`.
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
- **Small reception desk** tucked off to the side (`x ≈ -3`, `z ≈ 6`) so it
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
- Conference room: `conf_door` ↔ `hallSW`, `conf_door` ↔ `conf_center`,
  `conf_center` ↔ `conf_seat0..3`.
- Lounge: `lounge_door` ↔ `hallSE`, linked to `lounge_spot0..2` via
  `lounge_center`.
- Lobby: add `entrance` node (directly linked to `elevWait` — avoid routing
  through `hallS` and back again), `cafe_door` ↔ `hallSW`, bistro chair
  nodes, lounge chair nodes, etc.

For each "sittable" waypoint, publish a `sitTargets[wpName] = {sit, facing}`
entry recording whether the agent should play the sitting animation and what
`rotation.y` to face. Make sure the facing matches the chair's orientation
(e.g. office-desk chairs have `rotation.y = Math.PI` so the seat opens toward
the monitor; the person faces the monitor (`Math.PI`)).

### Call panel

Each call panel is a plate (≈0.55 × 1.4 × 0.05) with an up-arrow and
down-arrow (flat `ShapeGeometry` triangles, ≈0.13 half-width) and a
≈0.45-square canvas-texture floor display. These sizes are deliberately
chunky — the camera typically sits 20+ units away, and smaller panels
turn into unreadable specks.

Expose `panel.userData` with:
- `setUp(on)`, `setDown(on)` — swap the triangle's material between an
  unlit dark gray and a bright green "emissive" glow.
- `setIndicator(text)` — rewrite the canvas and flag the texture dirty.

Render the digits on a near-black canvas with a hot orange foreground
(`#ffbb22` on `#050505`), the glyph filling ~82% of the canvas, plus a
`shadowBlur` bloom to simulate glow. Use a 256-px canvas, `LinearFilter` +
mipmaps + anisotropy for crisp zooming.

**Cache the last-rendered text** on the texture (`tex._lastText`) and
early-out in `updateTextTexture` if unchanged — otherwise you reupload
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

## `elevator.js` — SCAN scheduler + in-car panel

### Car geometry

- Yellow semi-transparent frame (opacity 0.5) — floor, ceiling, side walls,
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

### Elevator class

Expose a `class Elevator { constructor(scene, world) {...} }` that:

**State machine** (use exactly these five states):
`IDLE → MOVING → DOOR_OPENING → DOOR_OPEN → DOOR_CLOSING → (IDLE or MOVING)`.

**Public API**:
- `callUp(floor)`, `callDown(floor)` — add to `this.upCalls` / `downCalls`
  sets. Refresh the corresponding call panel lamp.
- `pressDestination(floor)` — add to `this.destinations` set; light the
  in-car button.
- `isAcceptingAt(floor, direction)` — true only when the car is at `floor`
  in `DOOR_OPEN` state AND (there are no more stops pending in the current
  direction OR the caller's direction matches the car's).
- `currentCapacityFree()` — `MAX_CAPACITY - (passengers.size +
  pendingBoarders.size)`. Default `MAX_CAPACITY = 4`.
- `reserveBoardingSpot(person)` — if capacity available, assign one of 4
  interior local-space spots (front-left, front-right, back-left, back-
  right), add the person to `pendingBoarders`, return a `Vector3` local
  target. Return `null` if full.
- `completeBoard(person)` — move from `pendingBoarders` to `passengers`.
- `registerDisembark(person)` / `completeDisembark(person)` — same pattern
  for getting out; release the interior spot.
- `tick(dt)` — one-frame advance of the state machine.

**SCAN scheduling**:
- Maintain `this.direction ∈ {+1, 0, -1}` and `this.currentFloor`.
- At each door-close → pick-next-target transition:
  - If direction is UP: next target = `min(destinations ∪ upCalls above current)`;
    else reverse direction and next target = `max(destinations ∪ downCalls below current)`;
    else same-floor call; else `IDLE`.
  - Mirror for DOWN.
  - When IDLE with any calls: pick the nearest and infer direction.
- At each door-open (arrival): clear the served call for this floor in the
  current direction (plus destinations). If no more stops exist in the
  current direction, also clear the opposite-direction call at this floor so
  we can serve it before leaving.

**Critical: re-evaluate target during `MOVING`.** Each frame while MOVING,
scan for a closer stop in the same direction (e.g. someone on floor 2
pressed UP while the car was ascending from 0 to 5) and shorten
`targetFloor` if one exists. Without this, the car overshoots then comes
back — jarring and unrealistic.

**Door open logic**:
- Doors only close when BOTH `pendingBoarders.size == 0` AND
  `pendingDisembark.size == 0` AND a minimum open time (`MIN_DOOR_OPEN_S ≈
  3.5` motion-seconds) has elapsed. This is the mechanism that keeps the car
  waiting for agents who are walking in/out.
- Hard safety cap (`MAX_DOOR_OPEN_S ≈ 18`) in case something goes wrong.

**Indicators**:
- Every frame, update the shaft-side and in-car floor indicators with
  `currentFloor + direction arrow`.
- Update the call-panel up/down lamps whenever calls change.

---

## `sim.js` — clock, agents, day/night, render loop

### Scene setup

Create a `THREE.Scene`, `PerspectiveCamera` at `(28, 24, 28)` looking at
the building center, `WebGLRenderer({antialias:true, alpha:true})` with
`sortObjects = true`, `OrbitControls`, an `AmbientLight`, a
`DirectionalLight` (the "sun"), and a `HemisphereLight`. Instantiate
`createWorld(scene)` and `new Elevator(scene, world)`.

### Simulated clock

A `Clock` object owning:
- `simMinute` — minutes since midnight. Start at `7*60 + 30` (07:30).
- `timeScale` — **pure real-time multiplier.** 1x means one real second
  advances one sim second, so walks, elevator cycles, and the clock all
  tick in lockstep. Default `120` (≈5.5 min to play a whole workday);
  expose a log-spaced slider covering at least `1..600`.
  - **Do NOT decouple sim time from physical motion** (an earlier version
    used "N sim minutes per real second" with motion clamped slower; this
    is what causes morning/evening elevator bottlenecks where the clock
    races past the car's capacity to serve people).
- `tick(realDt)` — advance `simMinute` by `realDt * timeScale / 60`. On
  wrap past `24*60`, **reset both the agents AND the elevator** —
  re-initialize every agent with a fresh random schedule (arrival / lunch /
  departure times, `hasLunched = false`, `plannedMeetingTimes`, clear seat
  reservations), AND clear every elevator set (`upCalls`, `downCalls`,
  `destinations`, `passengers`, `pendingBoarders`, `pendingDisembark`),
  reset `spotOccupancy`, snap doors to closed, and park the car on floor 0.
  Forgetting to reset the elevator leaves phantom passengers that jam the
  scheduler on the next day.
- `format()` — `" 9:24 AM"`.

### Day / night

Interpolate scene background color, sun color + intensity, ambient
intensity, and hemi intensity across ~9 keyframes anchored at specific
hours. Shape the curve like a real day: **long flat daytime**, with the
transitions compressed into a narrow "golden hour" at dawn (~06:00–06:30)
and dusk (~17:30–18:30). Don't spread the ramp over 2-3 hours — real
daylight is bright from shortly after sunrise until shortly before
sunset, then transitions quickly.

**Night must not be pitch black** — keep `ambientIntensity ≈ 0.45` and
`hemiIntensity ≈ 0.32` so the building geometry and transparent walls
stay readable. (My first cut had night at `ai=0.22, hi=0.15` and the
whole interior disappeared.)

### Agents — two roles

The building supports **two roles**:

- **Workers** (`MAX_WORKERS = 20`) — one per desk. Full daily schedule
  (arrive morning, work, lunch, work, depart evening). Fixed count; can't
  exceed the number of desks.
- **Visitors** (`MAX_VISITORS = 80`) — deliveries, clients, job
  candidates, wanderers. They don't have a desk. Each one does a short
  visit plan and leaves, then is **recycled** by the top-up scheduler
  for another visit later the same day. This is what lets 80 visitor
  slots sustain dozens of concurrent visitors all day.

Together: `MAX_OCCUPANCY = MAX_WORKERS + MAX_VISITORS = 100`,
`DEFAULT_OCCUPANCY ≈ 45`.

Always build the **full pool** at startup so roles + desk assignments
stay stable; the slider moves agents between `AWAY` (normal lifecycle)
and a parked `DISABLED` state (invisible, never spawns, skipped by
collision and the render-loop dispatch).

**Critical — the dynamic top-up:** a naive "one arrival per visitor per
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

So visitors cycle continuously: arrive → visit → leave → brief gap →
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
  - `arrivalTime` — `8:15..9:30`
  - `lunchTime` — `11:30..13:30` (window, not exact)
  - `lunchDuration` — `25..60` minutes
  - `departureTime` — `16:45..18:30`, or with ~15% probability a
    "straggler" window `18:30..19:45`
  - `plannedMeetingTimes` — 0..2 pre-scheduled meeting minutes (one morning,
    one afternoon)
- `state` (`DISABLED` | `AWAY` → `ARRIVING`/`WAITING_ELEVATOR`/`IN_CAR`/
  `ON_FLOOR`/`AT_DESK`/`IN_MEETING`/`AT_BREAK`/`AT_LUNCH`/`VISITING`/
  `LEAVING`/`GONE`)
- `plan` (queue of primitive actions), `currentAction`.

### Primitive actions

All plans compile down to a sequence of these:
- `WALK_TO_WP(floor, wpName)` — BFS a path from the agent's current world
  position to the named waypoint on that floor; walk segment by segment.
- `WAIT_AT_PANEL(floor, dir)` — press the up/down call and stand still until
  the car is `DOOR_OPEN` at this floor with matching direction AND has
  capacity. Re-press the call every frame if it's missing (in case another
  direction's cycle cleared it).
- `ENTER_ELEVATOR()` — phased: reserve a spot (re-call if the car slipped
  away); walk into the door threshold in world space; reparent scene → car;
  walk to the reserved interior spot in car-local space; `completeBoard` and
  turn to face the doors (`rotation.y = 0`).
- `PRESS_FLOOR(floor)` — symbolic; lights the in-car button.
- `WAIT_FOR_FLOOR(floor)` — stay put until the car is `DOOR_OPEN` at `floor`.
- `EXIT_ELEVATOR(toFloor)` — reparent car → scene (preserving world pos,
  and `registerDisembark` to hold the doors); walk to `elevWait` on the
  target floor; `completeDisembark`.
- `SIT(floor, wpName)` — snap to the sit-spot, apply the target facing,
  set `isSitting = true`, and **lower the body y by ~0.35** so the hips
  align with the chair seat rather than floating above it.
- `STAND()` — clear sitting flag, restore y to floor height (or 0 if inside
  the car). **Do NOT release a seat reservation here**; STAND is also
  called at the start of a plan (to rise from a desk), long before the
  agent reaches the reserved seat. Release goes in `RELEASE_SEAT`.
- `RELEASE_SEAT()` — explicit release, placed in the plan AFTER the post-
  meeting `STAND()`.
- `WAIT_SIM(minutes)` — resolve `untilMin` in `startAction` (not at plan
  compile time!), then idle until `Clock.simMinute >= untilMin`.
- `EXIT_BUILDING()` — remove the person from the scene graph; state = GONE.
- `ENTER_STATE(state)`, `MARK_LUNCHED`, `PICK_NEXT_ACTIVITY` — zero-duration
  bookkeeping actions.

### Goal → plan compilers

Each of these returns a list of primitive actions. They end with
`WAIT_SIM(random minutes)` + `PICK_NEXT_ACTIVITY` so the agent loops into
its next decision naturally.

- `planArriveToDesk` — entrance → elevator up to home floor → office door →
  desk → sit → work for a while → decide next.
- `planGoToLunch` — from desk: office door → elevator down to lobby → bistro
  chair → sit and eat for `lunchDuration` → `MARK_LUNCHED` → elevator back
  up → back to desk.
- `planVisitLounge` — brief trip to the lounge on the same floor for ~5-12
  minutes.
- `planAttendMeeting` — pick a meeting floor (65% home floor, else random
  1..5); travel there; sit in a conference seat for 22-45 minutes; return
  to own desk.
- `planVisitCoworker` — pick a random agent currently `AT_DESK`; walk (or
  ride) to stand by their office door for 6-18 minutes; return.
- `planLeaveBuilding` — end-of-day for workers: office door → elevator
  down → entrance → `EXIT_BUILDING`.
- `planVisitorVisit` — for visitors only. Walk in from sidewalk, roll a
  weighted die to pick one activity, do it, leave. Roughly-tuned weights
  that keep any single venue from dominating:
  - ~10% bistro table (cafe)
  - ~6%  cafe counter
  - ~14% front lounge
  - ~12% back lounge / conversation pit
  - ~10% reception / kiosk / water cooler (stand briefly)
  - ~10% lobby loiter
  - ~15% ride up to an office-floor lounge
  - ~23% **sit in on a meeting** in a random floor's conference room —
    the "external attendee / client" archetype. Reserve a seat via
    `reserveConfSeat`; if all four are taken, fall back to a lobby
    loiter. Remember the trailing `RELEASE_SEAT` at the end of the
    meeting sub-plan.

  Then `WALK_TO_WP('entrance')` → `WALK_TO_WP('outside')` →
  `EXIT_BUILDING`. Workers' end-of-day override must check `role`:
  visitors run their own plan to completion; don't replace it.

  These weights were tuned deliberately — bistro + cafe counter at 22%
  total in an early version made the snack bar feel like the center of
  the universe while the conference rooms stayed empty. Keep the
  meeting slice generous or the building reads as "all cafe, all day."

### `chooseNextActivity(agent)` decision rules

At a desk-level decision point, check in this order:
1. Past departure time → `planLeaveBuilding`.
2. Any planned meeting whose time has arrived → remove it from the list,
   `planAttendMeeting`.
3. Past lunch window and `!hasLunched` → `planGoToLunch`.
4. Otherwise roll a weighted die:
   - ~14% ad-hoc meeting (`MEETING_PROB ≈ 0.36`, gated by a 0.4 factor)
   - ~12% lounge break
   - ~15% visit a coworker
   - rest: `WAIT_SIM(18..65 min)` + another decision later (keep working).

The meeting weight is deliberately generous — without it, conference
rooms sit empty most of the day and the lounge couches do all the
visible "work."

### Render loop

Each frame:
1. `realDt = min(0.05, clock.getDelta())`. Advance the sim clock.
2. Update lighting from current sim time.
3. `motionDt = realDt * timeScale` — motion and sim clock advance together.
   Don't try to clamp this below `timeScale`: the whole point of the
   lockstep model is that the elevator scales up just as fast as the
   morning rush it needs to serve. At 1x an agent walks at ~1.3 m/s; at
   120x the same trip plays out 120× faster.
4. `elevator.tick(motionDt)`.
5. For each agent, process daily schedule (spawn if `AWAY` and arrived;
   replan to `planLeaveBuilding` if past departure and not already heading
   home; run the action dispatch loop).

   **Action dispatch must loop within one frame** (up to ~16 iterations) so
   zero-duration actions (SIT, STAND, PRESS_FLOOR, ENTER_STATE, etc.) hand
   off to the next action immediately. Without this, there's a one-frame
   gap where nothing is registered as pending-disembark and the elevator
   may close its doors on a passenger who was about to step out.
6. `applyCollisions()` — O(n²) soft repulsion between agents sharing the
   same parent within ~1 unit of Y and ~0.7 of XZ. Skip sitting agents
   **and skip any agent currently parented to the elevator car** — the
   car's 4 interior spots are pre-assigned, so applying repulsion inside
   the tiny 3×3 cabin makes boarders oscillate forever (the "twitching
   legs" bug). Use a low push scalar (~0.18) so a walking agent can still
   make progress past a stationary body.
7. `animatePersonWalking(agent.group, motionDt)` for each agent still in
   the scene graph.
8. `controls.update(); renderer.render(scene, camera); updateHUD();`

### UI

Top-left HUD panel with:
- Large simulated-time display (`" 9:24 AM"`).
- **Speed slider** — log-spaced stops across `1..600`× realtime.
- **Occupancy slider** — linear `1..MAX_OCCUPANCY` (= 100), labeled
  "Occupancy: N / 100 people". On input:
  - Set `targetOccupancy = slider.value`.
  - Call `applyOccupancy()`: for each agent, flip `DISABLED ↔ AWAY`
    based on `agent.id < targetOccupancy`. Agents that are already in
    the middle of a workday (AT_DESK, IN_CAR, etc.) are left running —
    they'll finish naturally, reach `GONE`, and only be parked
    `DISABLED` on the next day-wrap. This keeps the slider responsive
    without yanking people mid-walk.
  - The day-wrap reset must also honor `targetOccupancy` when deciding
    which agents come back for the new day.
  - The **`topUpVisitors()` tick** (called each frame from the render
    loop) then keeps the concurrent population at the slider value by
    re-arming AWAY / GONE visitors with a new arrival ~0–6 sim-minutes
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

## Tuning pass (optional, but don't skip)

When the simulation runs, watch for these issues and fix them:
- **Text textures re-uploading every frame** → cache `_lastText` on the
  canvas texture.
- **Elevator overshoots a closer stop** → re-evaluate target in
  `_tickMoving`, not only at door-close.
- **An agent waiting to board gets stranded when the car leaves** → in the
  `reserve` phase of `ENTER_ELEVATOR`, re-press the call if the car has
  already left.
- **A passenger's `WAIT_FOR_FLOOR` completes but their `EXIT_ELEVATOR`
  starts next frame, doors close on them** → action dispatch must loop
  multiple transitions per frame.
- **`WAIT_SIM` durations feel wrong** → resolve `untilMin` in
  `startAction`, not at plan compile time.
- **People standing on top of their chairs** → drop the body by ~0.35 on
  `SIT`, restore on `STAND`.
- **Boarders converge at the same door threshold and push each other
  around** → when an agent reserves a spot, aim their walk-to-door at
  the `spotWorld.x` X-coordinate (not `x=0`), so each of the 4 boarders
  enters on their own lane.
- **Two agents walk to the same conference seat and oscillate** → maintain
  a `seatReservations` Set keyed by `"floor:wpName"`; reserve at plan
  compile time, release via an explicit `RELEASE_SEAT` action AFTER the
  post-meeting `STAND` (not inside `STAND` itself — the opening `STAND`
  of the plan would otherwise release the reservation before the agent
  even starts walking). Also release in the end-of-day override and on
  day-wrap. If all four seats are already reserved, fall back to a lounge
  break plan.
- **Legs twitch in place while an agent is blocked** → in the walk loop,
  track `_prevWp` / `_stallT`; if the agent makes <0.005/frame of
  progress for >1.2 seconds of motion time, skip the current waypoint and
  advance the path index.
- **Two agents occupy exactly the same spot (no personal space)** →
  three fixes layered together:
  1. On `SIT` with a **standing** waypoint (target.sit === false), jitter
     position by a small random ring (radius 0.35–0.75) so two visitors
     assigned to the same lobby loiter waypoint don't snap to identical
     coordinates.
  2. On **spawn at entrance**, jitter X/Z by ±1.1 / ±0.75 — visitors
     often arrive in the same frame via the top-up scheduler and would
     otherwise pile up on the sidewalk.
  3. In the collision resolver, handle the `d < 1e-3` case (exact
     overlap) by picking a random separation direction instead of the
     normal gradient — otherwise the bodies have no push axis and stay
     stuck in each other.
- **Elevator gets stuck with boarders unable to reach it in a crowded
  lobby** → once the lobby has dozens of loitering visitors, a boarder
  walking toward the open doors gets pushed around by collision and
  never arrives, so doors stay open (held by `pendingBoarders.size > 0`)
  until `MAX_DOOR_OPEN_S` fires. Two fixes together:
  1. **Collision exemption for boarders** — in `applyCollisions()`, skip
     any agent whose `currentAction.type === 'ENTER_ELEVATOR'`. They
     have a reserved spot and must be allowed to push through the crowd.
  2. **Stall-recovery in `walkToDoor`** — track `_prevWalk` / `_stallT`
     inside the ENTER_ELEVATOR action just like `walkAlongPath` does.
     After ~1.5 motion-seconds of no progress, teleport the agent to the
     threshold to force-complete the phase.
- **Morning traffic jam** — expected mild queuing! With 19 agents arriving
  in a ~105-min window and capacity 4, the lobby should briefly queue
  during peak arrival and peak departure. The elevator should cycle
  several times per batch. That's the goal, not a bug.

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
- A time-of-day readout that advances at 120× realtime by default (≈5.5
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
truncated or malformed.
