# Elevator Building Simulation — One-Shot Prompt

Use the agentic coding tools available to you to write files that implement
an animated 3D elevator simulation running entirely in the browser with no
build process. The page must work when opened directly from a `file://` URL:
use classic scripts, not ES modules, imports, import maps, or `fetch()` to load
code.

Build a small browser-based elevator simulation from scratch. The current
directory is an empty workspace: create the files you need here. Work only in
this directory; do not use `find` or search outside it.

- Create a 3D building with five floors and an elevator using HTML and
  JavaScript.
- Start with four passengers, one on each of four floors, leaving one floor
  empty.
- Repeatedly choose a random passenger and take them by elevator to the empty
  floor; their old floor becomes empty.
- Create the simulation before running the provided checks:
  `node ../../static_check.js .` and `node ../../runtime_check.js .`.

Keep the implementation simple. The task is a 3D HTML/JavaScript simulation
that repeatedly moves a random passenger to the currently empty floor.
