/*
 * runtime_check.js - headless runtime check for the office simulation.
 *
 *  1. Verifies all required files exist and index.html loads scripts in the
 *     required order (no ES modules in browser files).
 *  2. Syntax-checks every JS file.
 *  3. Runs the pure elevator logic test suite.
 *  4. Stubs THREE + DOM, loads the browser files in a vm sandbox, drives the
 *     simulation for 150 simulated seconds, and asserts behavioral
 *     invariants: capacity, anti-starvation, arrivals, no stuck agents,
 *     no NaN positions, door cycles.
 *
 * Usage: node runtime_check.js [dir]
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();

let failures = 0;
function check(name, cond, detail) {
    if (cond) {
        console.log("  PASS  " + name);
    } else {
        failures++;
        console.log("  FAIL  " + name + (detail ? "  -- " + detail : ""));
    }
}

// ---------------------------------------------------------------------------
// 1. Files + index.html script order
// ---------------------------------------------------------------------------
console.log("== file layout ==");
const REQUIRED = [
    "index.html",
    "person.js",
    "world.js",
    "elevator_logic.js",
    "elevator.js",
    "sim.js",
    "elevator_logic_test.js"
];
for (const f of REQUIRED) {
    check("exists: " + f, fs.existsSync(path.join(DIR, f)));
}
if (failures > 0) {
    console.log("Runtime check aborted: missing files.");
    process.exit(1);
}

const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const scriptSrcs = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
check("three.js r147 CDN loaded", scriptSrcs.some(s => s.includes("three") && s.includes("r147")));
check("OrbitControls loaded", scriptSrcs.some(s => s.includes("OrbitControls")));

const localOrder = ["person.js", "world.js", "elevator_logic.js", "elevator.js", "sim.js"];
const idxOf = s => scriptSrcs.indexOf(s);
let orderOk = true;
let orderDetail = "";
for (let i = 0; i < localOrder.length; i++) {
    const pos = idxOf(localOrder[i]);
    if (pos === -1) { orderOk = false; orderDetail = localOrder[i] + " missing"; break; }
    if (i > 0 && pos <= idxOf(localOrder[i - 1])) {
        orderOk = false;
        orderDetail = localOrder[i] + " out of order";
        break;
    }
}
check("local script load order", orderOk, orderDetail);
check("three.js loads before local files",
    scriptSrcs.findIndex(s => s.includes("r147")) < idxOf("person.js"));

// no ES modules in browser files
for (const f of ["person.js", "world.js", "elevator.js", "sim.js", "index.html"]) {
    const src = fs.readFileSync(path.join(DIR, f), "utf8");
    const hasImport = /\bimport\s+[\w{*]/m.test(src);
    const hasExport = f === "index.html" ? false : /\bexport\s+(const|let|var|function|default)/m.test(src);
    check("no ES module syntax in " + f, !hasImport && !hasExport);
}

// ---------------------------------------------------------------------------
// 2. Syntax check
// ---------------------------------------------------------------------------
console.log("== syntax ==");
for (const f of ["person.js", "world.js", "elevator_logic.js", "elevator.js", "sim.js"]) {
    const src = fs.readFileSync(path.join(DIR, f), "utf8");
    let ok = true;
    let err = "";
    try {
        new vm.Script(src, { filename: f });
    } catch (e) {
        ok = false;
        err = e.message;
    }
    check("syntax: " + f, ok, err);
}

// ---------------------------------------------------------------------------
// 3. Pure elevator logic tests
// ---------------------------------------------------------------------------
console.log("== elevator logic unit tests ==");
const { spawnSync } = require("child_process");
const testResult = spawnSync(process.execPath, [path.join(DIR, "elevator_logic_test.js")], { encoding: "utf8" });
if (testResult.stdout) process.stdout.write(testResult.stdout);
check("elevator_logic_test.js exits 0", testResult.status === 0, testResult.stderr ? testResult.stderr.slice(0, 300) : "exit " + testResult.status);

const ElevatorLogic = require(path.join(DIR, "elevator_logic.js")).ElevatorLogic;
{
    const e = new ElevatorLogic({ floorCount: 6, maxCapacity: 4 });
    e.callUp(0);
    e.tick(30);
    check("logic: car reaches lobby", e.currentFloor === 0, "at " + e.currentFloor);
    e.reset();
    check("logic: reset", e.state === "IDLE" && e.position === 0);
}

// ---------------------------------------------------------------------------
// 4. Headless full simulation
// ---------------------------------------------------------------------------
console.log("== headless simulation (150 s) ==");

// ---- minimal THREE stub ----
function V3(x, y, z) { return { x: x || 0, y: y || 0, z: z || 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; }, clone() { return V3(this.x, this.y, this.z); }, distanceTo(v) { const dx = v.x - this.x, dy = v.y - this.y, dz = v.z - this.z; return Math.sqrt(dx * dx + dy * dy + dz * dz); } }; }

function Group() {
    const g = {
        isGroup: true, children: [], position: V3(0, 0, 0), rotation: { x: 0, y: 0, z: 0 },
        visible: true, userData: {}, renderOrder: 0,
        add(...objs) { for (const o of objs) { this.children.push(o); o.parent = this; } return this; },
        traverse(fn) { fn(this); for (const c of this.children) if (c.traverse) c.traverse(fn); }
    };
    return g;
}

function Mesh(geometry, material) {
    return { isMesh: true, geometry, material, position: V3(0, 0, 0), rotation: { x: 0, y: 0, z: 0 }, renderOrder: 0, userData: {} };
}

const geomFactory = () => function () { return { clone() { return this; } }; };
const matFactory = (name) => function (opts) { return { name, opts: opts || {} }; };

const THREE = {
    Vector3: V3,
    Group: Group,
    Mesh: Mesh,
    BoxGeometry: geomFactory(),
    CylinderGeometry: geomFactory(),
    SphereGeometry: geomFactory(),
    ConeGeometry: geomFactory(),
    PlaneGeometry: geomFactory(),
    ShapeGeometry: geomFactory(),
    Shape: function () { return { moveTo() {}, lineTo() {}, closePath() {} }; },
    MeshLambertMaterial: matFactory("lambert"),
    MeshBasicMaterial: matFactory("basic"),
    CanvasTexture: function (image) { return { image, needsUpdate: false, minFilter: 0, generateMipmaps: true, anisotropy: 1, _lastText: "" }; },
    Scene: function () { return { children: [], add(o) { this.children.push(o); }, background: null, fog: null }; },
    Color: function (hex) { return { offsetHSL() { return this; }, getHex() { return hex; } }; },
    Fog: function () { return {}; },
    PerspectiveCamera: function () { return { position: V3(), aspect: 1, updateProjectionMatrix() {} }; },
    WebGLRenderer: function () { return { setSize() {}, setPixelRatio() {}, render() {}, domElement: {} }; },
    AmbientLight: function () { return { position: V3() }; },
    DirectionalLight: function () { return { position: V3() }; },
    GridHelper: function () { return { position: V3() }; },
    Clock: function () { return { getDelta: () => 0.016 }; },
    OrbitControls: function () { return { target: V3(), enableDamping: false, dampingFactor: 0, update() {} }; },
    DoubleSide: 2,
    LinearFilter: 1006
};

// ---- minimal DOM stub ----
function makeCtx() {
    return {
        fillRect() {}, fillText() {},
        set font(v) { this._font = v; }, get font() { return this._font; },
        textAlign: "", textBaseline: "", shadowColor: "", shadowBlur: 0, fillStyle: ""
    };
}
function makeCanvas() {
    return { width: 0, height: 0, getContext: () => makeCtx() };
}
function makeEl() {
    return { style: { cssText: "" }, children: [], textContent: "", appendChild() {}, addEventListener() {} };
}
const documentStub = {
    createElement: (tag) => (tag === "canvas" ? makeCanvas() : makeEl()),
    body: makeEl(),
    addEventListener() {}
};

const windowStub = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener() {},
    THREE: THREE,
    document: documentStub,
    requestAnimationFrame: () => 0 // no loop: we drive simDebug.step manually
};
windowStub.window = windowStub;
windowStub.globalThis = windowStub;

const sandbox = Object.create(null);
sandbox.window = windowStub;
sandbox.THREE = THREE;
sandbox.document = documentStub;
sandbox.requestAnimationFrame = windowStub.requestAnimationFrame;
sandbox.console = console;
sandbox.Math = Math;
sandbox.Set = Set;
sandbox.Date = Date;
vm.createContext(sandbox);

const loadOrder = ["person.js", "world.js", "elevator_logic.js", "elevator.js", "sim.js"];
for (const f of loadOrder) {
    const src = fs.readFileSync(path.join(DIR, f), "utf8");
    try {
        vm.runInContext(src, sandbox, { filename: f });
        check("loaded: " + f, true);
    } catch (e) {
        check("loaded: " + f, false, e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e.message);
    }
}

const sim = windowStub.simDebug;
check("simDebug exposed", !!sim);

if (sim) {
    const DT = 0.05;
    const STEPS = 3000; // 150 simulated seconds
    let maxRiders = 0;
    let doorOpens = 0;
    let wasDoorOpen = false;
    let logicErrors = 0;
    let nanPeople = 0;

    // stuck detection
    const stateSince = new Map();
    let maxStateDuration = 0;
    let stuckWho = "";

    const people = sim.people();
    check("100 people spawned", people.length === 100, "got " + people.length);

    for (let s = 0; s < STEPS; s++) {
        try {
            sim.step(DT);
        } catch (e) {
            check("step " + s + " threw", false, e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e.message);
            break;
        }
        const logic = sim.elevLogic();
        const t = sim.simTime();

        if (logic.passengers.size > maxRiders) maxRiders = logic.passengers.size;
        if (logic.passengers.size > 4) logicErrors++;
        if (logic.position < -0.01 || logic.position > 5.01) logicErrors++;
        if (!isFinite(logic.position)) logicErrors++;
        if (logic.state === "DOOR_OPEN") {
            if (!wasDoorOpen) doorOpens++;
            wasDoorOpen = true;
        } else {
            wasDoorOpen = false;
        }
        if (!["IDLE", "MOVING", "DOOR_OPENING", "DOOR_OPEN", "DOOR_CLOSING"].includes(logic.state)) {
            logicErrors++;
        }

        for (const p of people) {
            const pos = p.group.position;
            if (!isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)) {
                nanPeople++;
                break;
            }
            // stuck tracking
            const prev = stateSince.get(p.id);
            if (prev && prev.state === p.state) {
                const dur = prev.dur + DT;
                stateSince.set(p.id, { state: p.state, dur });
                if (dur > maxStateDuration) {
                    maxStateDuration = dur;
                    stuckWho = p.type + "#" + p.id + " " + p.state;
                }
            } else {
                stateSince.set(p.id, { state: p.state, dur: DT });
            }
        }
    }

    check("elevator capacity never exceeded 4", maxRiders <= 4, "max " + maxRiders);
    check("elevator logic always sane", logicErrors === 0, logicErrors + " violations");
    check("no NaN person positions", nanPeople === 0);
    check("door open cycles observed (>= 8)", doorOpens >= 8, "got " + doorOpens);

    let workersAtDesk = 0, workersAway = 0, workersOther = 0;
    let visitorsSpawned = 0, visitorsGone = 0;
    for (const p of people) {
        if (p.type === "worker") {
            if (p.state === "AT_DESK") workersAtDesk++;
            else if (p.state === "AWAY") workersAway++;
            else workersOther++;
        } else {
            if (p.state !== "AWAY") visitorsSpawned++;
            if (p.state === "GONE") visitorsGone++;
        }
    }
    check("workers reached desks (>= 12 of 20)", workersAtDesk >= 12,
        "atDesk=" + workersAtDesk + " away=" + workersAway + " other=" + workersOther);
    check("visitors spawned (>= 25 of 80)", visitorsSpawned >= 25, "got " + visitorsSpawned);
    check("some visitors completed & left", visitorsGone >= 3, "got " + visitorsGone);
    check("no agent stuck > 100 s in one state", maxStateDuration < 100, stuckWho + " for " + maxStateDuration.toFixed(1) + "s");

    // nobody left in the building without a plan (stall detector)
    let stalled = 0;
    for (const p of people) {
        if (p.state === "GONE" || p.state === "AWAY" || p.state === "DISABLED") continue;
        if (p.plan.length === 0 && p.state !== "AT_DESK" && p.path.length === 0 && !p.action) {
            stalled++;
        }
    }
    check("no stalled agents (no plan, no action)", stalled === 0, stalled + " stalled");
}

console.log("");
if (failures > 0) {
    console.log("RUNTIME CHECK FAILED: " + failures + " failure(s)");
    process.exit(1);
} else {
    console.log("RUNTIME CHECK PASSED");
}
