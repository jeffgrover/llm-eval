/* node-based harness: runs world.build + characters against a stub WebGL context.
   Validates geometry generation and state machine — no browser needed. */
'use strict';

function anyProxy() {
  var fn = function () { return proxy; };
  var proxy = new Proxy(fn, {
    get: function (t, p) {
      if (p === Symbol.toPrimitive || p === 'then' || p === 'toString') return function() { return '0'; };
      if (p === 'width' || p === 'height') return 100;
      return proxy;
    },
    apply: function () { return proxy; },
    set: function () { return true; }
  });
  return proxy;
}

var canvasStub = (function () {
  return {
    width: 0, height: 0, style: {},
    getContext: function () { return anyProxy(); },
    addEventListener: function () {},
    parentNode: null
  };
})();

global.window = {
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
  addEventListener: function () {}, requestAnimationFrame: function () {}
};
global.document = {
  getElementById: function () { return canvasStub; },
  createElement: function () { return { width: 0, height: 0, style: {}, getContext: function () { return anyProxy(); }, addEventListener: function () {} }; },
  addEventListener: function () {}
};

var fs = require('fs');
function loadScript(p) {
  var src = fs.readFileSync(p, 'utf8');
  var fn = new Function('window', 'document', 'globalThis', src +
    '\nreturn { Engine: typeof Engine !== "undefined" ? Engine : null, World: typeof World !== "undefined" ? World : null, Characters: typeof Characters !== "undefined" ? Characters : null, Main: typeof Main !== "undefined" ? Main : null };');
  return fn(global.window, global.document, globalThis);
}

var loaded = loadScript('js/engine.js');
var E = loaded.Engine;
var W = loadScript('js/world.js').World;
var C = loadScript('js/characters.js').Characters;
loadScript('js/main.js');
if (!E || !W || !C) throw new Error('modules missing');

console.log('Engine keys:', Object.keys(E).slice(0, 12).join(','));
console.log('Engine.Builder:', typeof E.Builder);
function checkGeo(g, name) {
  if (!g || !g.pos || g.pos.length === 0) throw new Error(name + ': empty pos');
  if (!g.count) throw new Error(name + ': empty count');
  var nv = g.pos.length / 3;
  // NaN check
  for (var i = 0; i < g.pos.length; i++) if (isNaN(g.pos[i])) throw new Error(name + ': NaN pos at ' + i);
  if (g.nrm) for (i = 0; i < g.nrm.length; i++) if (isNaN(g.nrm[i])) throw new Error(name + ': NaN nrm at ' + i);
  if (g.col) for (i = 0; i < g.col.length; i++) if (isNaN(g.col[i])) throw new Error(name + ': NaN col at ' + i);
  var maxIdx = 0;
  for (i = 0; i < g.idx.length; i++) if (g.idx[i] > maxIdx) maxIdx = g.idx[i];
  if (maxIdx >= nv) throw new Error(name + ': index out of range: ' + maxIdx + ' >= ' + nv);
  if (g.count !== g.idx.length) throw new Error(name + ': count mismatch');
  if (g.count > g.pos.length) throw new Error(name + ': count too big');
  return nv;
}

// capture geos from makeMesh / makeTexturedMesh
var geoNames = ['ext', 'int', 'glass'];
var captured = [];
var origMakeMesh = E.makeMesh.bind(E);
var origMT = E.makeTexturedMesh.bind(E);
E.makeMesh = function (g) { captured.push({ name: 'mesh ' + captured.length, geo: g }); return origMakeMesh(g); };
E.makeTexturedMesh = function (g) { captured.push({ name: 'texmesh ' + captured.length, geo: g }); return origMT(g); };

var world = W.build(E);
E.makeMesh = origMakeMesh; E.makeTexturedMesh = origMT;

var total = 0;
for (var i = 0; i < captured.length; i++) {
  total += checkGeo(captured[i].geo, captured[i].name);
}
var carGeo = W.buildCarGeometry(E); // just confirm it constructs without error
console.log('static geometry ok — total verts:', total, 'geos:', captured.length);

console.log('towers:', world.towerMeshes.length, 'desks:', world.allDesks.length, 'conf chairs floor1:', W.conferenceChairs(1).length);

// --- characters ---
console.log('C keys:', Object.keys(C));
var chars = C.init(E, world, 4242);
console.log('workers:', chars.characters().length, 'pedestrians:', chars.pedestrians().length);

// full-cycle simulation with a simplified elevator (mirrors main.js elevator logic)
var dt = 1 / 30;
var states = {};
var elevFloor = 0, elevY = 0.55, elevState = 'idle', elevOpenTimer = 0;
var floorSurf = function (f) { return f * 4.2 + 0.55; };

for (var step = 0; step < 170 * 30; step++) {
  var t = step * dt;
  var cycleTime = t % 160;
  var workers = chars.characters();

  // riders follow elevator
  for (var i = 0; i < workers.length; i++) {
    var w = workers[i];
    if (w.hidden) continue;
    if (w.state === 'boarding' || w.state === 'riding' || w.state === 'exit_car') {
      w.carY = elevY;
      w.carX = 0;
      w.carZ = -4.78;
    }
  }

  // simplified elevator
  var riding = workers.filter(function (w) { return !w.hidden && w.state === 'riding'; });
  var waiting = workers.filter(function (w) { return !w.hidden && w.state === 'wait_elev'; });
  var target = null;
  if (riding.length) target = riding[0].targetFloor;
  else if (waiting.length) target = waiting[0].waitFloor;

  if (elevState === 'idle') {
    if (target !== null && target !== elevFloor) elevState = 'moving';
    else if (target !== null && target === elevFloor) { elevState = 'open'; elevOpenTimer = 0; }
  } else if (elevState === 'moving') {
    var ty = floorSurf(target === null ? elevFloor : target);
    var d = ty - elevY;
    if (Math.abs(d) < 0.03) {
      elevY = ty; elevFloor = target === null ? elevFloor : target; elevState = 'open'; elevOpenTimer = 0;
    } else {
      elevY += Math.sign(d) * Math.min(Math.abs(d), 6 * dt);
    }
  } else if (elevState === 'open') {
    elevOpenTimer += dt;
    for (var i2 = 0; i2 < waiting.length; i2++) {
      var w2 = waiting[i2];
      if (w2.waitFloor === elevFloor && w2.state === 'wait_elev') {
        w2.state = 'boarding'; w2.path = [{ x: 0, z: -4.55 }]; w2.pathI = 0;
      }
    }
    for (i2 = 0; i2 < riding.length; i2++) {
      var w3 = riding[i2];
      if (w3.targetFloor === elevFloor && w3.state === 'riding') {
        w3.state = 'exit_car'; w3.path = [{ x: 0, z: -1.6 }]; w3.pathI = 0;
      }
    }
    if (elevOpenTimer > 1.3) elevState = 'idle';
  }
  if (elevState === 'idle' && target === null) { elevState = 'idle'; }

  chars.update(dt, cycleTime);
  for (i = 0; i < workers.length; i++) {
    states[workers[i].state] = (states[workers[i].state] || 0) + 1;
  }
  if (step % (30 * 40) === 0) {
    var breakdown = {};
    for (i = 0; i < workers.length; i++) breakdown[workers[i].state] = (breakdown[workers[i].state] || 0) + 1;
    console.log('t=' + Math.round(t) + 's:', JSON.stringify(breakdown));
  }
}
console.log('state samples:', JSON.stringify(states));

for (i = 0; i < chars.characters().length; i++) {
  var w = chars.characters()[i];
  if (isNaN(w.x) || isNaN(w.y) || isNaN(w.z) || isNaN(w.yaw)) throw new Error('NaN in worker ' + i + ': ' + JSON.stringify(w));
}
console.log('all workers finite');

// draw pass (geometry gen for workers)
var ctx = { viewProj: new Float32Array(16) };
try {
  chars.draw(ctx);
  console.log('draw pass ok');
} catch (e) {
  console.log('draw pass error:', e.message);
}
console.log('HARNESS OK');

/* ---------- full main.js smoke test (stub GL) ---------- */
global.window.requestAnimationFrame = function (cb) { window.__rafCb = cb; };
globalThis.requestAnimationFrame = global.window.requestAnimationFrame;
globalThis.Engine = E; globalThis.World = W; globalThis.Characters = C;
// re-load main.js fresh with the new rAF stub
var loadedMain = loadScript('js/main.js');
var Main = loadedMain.Main;
var Main_ = { init: Main.init.bind(Main) };
Main_.init();
var rafCb = function () { return window.__rafCb; };
var ts = 0;
for (var f = 0; f < 9800; f++) {
  ts += 1000 / 60;
  var cb = rafCb();
  if (typeof cb !== 'function') throw new Error('no rAF callback captured at frame ' + f);
  cb(ts);
}
console.log('main.js: 9800 frames rendered OK (' + Math.round(9800/60) + 's sim)');
console.log('DONE');
