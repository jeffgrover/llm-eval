/* ============================================================
   engine.js — minimal WebGL1 engine (no dependencies)
   ============================================================ */
var Engine = (function () {
  'use strict';

  var canvas = document.getElementById('view');
  var gl = canvas.getContext('webgl', { antialias: true, alpha: false, depth: true });
  if (!gl) throw new Error('WebGL not available');
  var uintExt = gl.getExtension('OES_element_index_uint');

  /* ---------------- math helpers ---------------- */
  function mat4Camera(out, eye, center, up) {
    var fx = center[0] - eye[0], fy = center[1] - eye[1], fz = center[2] - eye[2];
    var fl = Math.sqrt(fx*fx + fy*fy + fz*fz) || 1; fx /= fl; fy /= fl; fz /= fl;
    var sx = fy * up[2] - fz * up[1], sy = fz * up[0] - fx * up[2], sz = fx * up[1] - fy * up[0];
    var sl = Math.sqrt(sx*sx + sy*sy + sz*sz) || 1; sx /= sl; sy /= sl; sz /= sl;
    var ux = sy * fz - sz * fy, uy = sz * fx - sx * fz, uz = sx * fy - sy * fx;
    out[0] = sx; out[1] = ux; out[2] = -fx; out[3] = 0;
    out[4] = sy; out[5] = uy; out[6] = -fy; out[7] = 0;
    out[8] = sz; out[9] = uz; out[10] = -fz; out[11] = 0;
    out[12] = -(sx*eye[0] + sy*eye[1] + sz*eye[2]);
    out[13] = -(ux*eye[0] + uy*eye[1] + uz*eye[2]);
    out[14] = fx*eye[0] + fy*eye[1] + fz*eye[2];
    out[15] = 1;
    return out;
  }
  function mat4Perspective(out, fovY, aspect, near, far) {
    var t = 1 / Math.tan(fovY / 2);
    out[0] = t / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = t; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[12] = 0; out[13] = 0;
    out[14] = 2 * far * near / (near - far);
    out[15] = 0;
    return out;
  }
  function mat4Mul(out, a, b) {
    var c = new Float32Array(16);
    for (var col = 0; col < 4; col++) {
      for (var row = 0; row < 4; row++) {
        var sum = 0;
        for (var k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
        c[col * 4 + row] = sum;
      }
    }
    out.set(c);
    return out;
  }
  function cameraToMatrices(eye, center, fovY, aspect, near, far) {
    var view = mat4Camera(new Float32Array(16), eye, center, [0, 1, 0]);
    var proj = mat4Perspective(new Float32Array(16), fovY, aspect, near, far);
    var vp = new Float32Array(16);
    mat4Mul(vp, proj, view);
    return { view: view, proj: proj, viewProj: vp };
  }
  function mat3FromModel(m) {
    return new Float32Array([
      m[0], m[1], m[2],
      m[4], m[5], m[6],
      m[8], m[9], m[10]
    ]);
  }
  var IDENTITY_MODEL = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

  /* ---------------- static geometry builder ---------------- */
  function Builder() {
    if (!(this instanceof Builder)) return new Builder();
    this.pos = []; this.nrm = []; this.col = []; this.uv = []; this.idx = [];
  }
  Builder.prototype.quad = function (a, b, c, d, hint, col, uvs) {
    var abx = b[0]-a[0], aby = b[1]-a[1], abz = b[2]-a[2];
    var acx = c[0]-a[0], acy = c[1]-a[1], acz = c[2]-a[2];
    var nx = aby * acz - abz * acy;
    var ny = abz * acx - abx * acz;
    var nz = abx * acy - aby * acx;
    var len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
    nx /= len; ny /= len; nz /= len;
    var flipped = false;
    if (hint && (nx * hint[0] + ny * hint[1] + nz * hint[2]) < 0) {
      nx = -nx; ny = -ny; nz = -nz; flipped = true;
    }
    var base = this.pos.length / 3;
    var uv = uvs || [[0,0],[1,0],[1,1],[0,1]];
    var verts = [a, b, c, d];
    var perVert = Array.isArray(col) && Array.isArray(col[0]);
    for (var i = 0; i < 4; i++) {
      this.pos.push(verts[i][0], verts[i][1], verts[i][2]);
      this.nrm.push(nx, ny, nz);
      var cc = perVert ? col[i] : col;
      this.col.push(cc[0], cc[1], cc[2]);
      this.uv.push(uv[i][0], uv[i][1]);
    }
    if (flipped) this.idx.push(base, base+2, base+1, base, base+3, base+2);
    else this.idx.push(base, base+1, base+2, base, base+2, base+3);
  };
  Builder.prototype.fan = function (center, ring, hint, col) {
    var base = this.pos.length / 3;
    var n = hint ? [hint[0], hint[1], hint[2]] : [0, 1, 0];
    var nl = Math.sqrt(n[0]*n[0] + n[1]*n[1] + n[2]*n[2]) || 1;
    n = [n[0]/nl, n[1]/nl, n[2]/nl];
    this.pos.push(center[0], center[1], center[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.col.push(col[0], col[1], col[2]);
    this.uv.push(0.5, 0.5);
    for (var i = 0; i < ring.length; i++) {
      this.pos.push(ring[i][0], ring[i][1], ring[i][2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.col.push(col[0], col[1], col[2]);
      this.uv.push(ring[i][0], ring[i][1]);
    }
    for (var j = 0; j < ring.length - 1; j++) this.idx.push(base, base + 1 + j, base + 1 + j + 1);
    this.idx.push(base, base + ring.length, base + 1);
  };
  Builder.prototype.box = function (cx, cy, cz, w, h, d, col, rotY) {
    var x0 = cx - w/2, x1 = cx + w/2, y0 = cy - h/2, y1 = cy + h/2, z0 = cz - d/2, z1 = cz + d/2;
    var ry = rotY || 0;
    var cos = Math.cos(ry), sin = Math.sin(ry);
    function T(x, y, z) {
      var dx = x - cx, dz = z - cz;
      return [cx + dx * cos + dz * sin, y, cz - dx * sin + dz * cos];
    }
    var A = T(x0, y0, z1), B = T(x1, y0, z1), C = T(x1, y1, z1), D = T(x0, y1, z1);
    var E = T(x1, y0, z0), F = T(x0, y0, z0), G = T(x0, y1, z0), H = T(x1, y1, z0);
    var fn = rotY ? [Math.sin(ry), 0, Math.cos(ry)] : [0, 0, 1];
    var rn = rotY ? [Math.cos(ry), 0, -Math.sin(ry)] : [1, 0, 0];
    var bn = rotY ? [-Math.sin(ry), 0, -Math.cos(ry)] : [0, 0, -1];
    var ln = rotY ? [-Math.cos(ry), 0, Math.sin(ry)] : [-1, 0, 0];
    this.quad(A, B, C, D, fn, col);
    this.quad(E, F, G, H, bn, col);
    this.quad(B, E, H, C, rn, col);
    this.quad(F, A, D, G, ln, col);
    this.quad(D, C, H, G, [0, 1, 0], col);
    this.quad(F, E, B, A, [0, -1, 0], col);
  };
  Builder.prototype.cylinder = function (cx, cy, cz, rTop, rBottom, h, seg, col, caps) {
    caps = caps === undefined ? true : caps;
    seg = seg || 10;
    var i, j, a0, a1;
    var prevB = null, prevT = null;
    for (i = 0; i < seg; i++) {
      a0 = (i / seg) * Math.PI * 2;
      a1 = ((i + 1) / seg) * Math.PI * 2;
      var bx = cx + rBottom * Math.cos(a0), bz = cz + rBottom * Math.sin(a0);
      var tx = cx + rTop * Math.cos(a0), tz = cz + rTop * Math.sin(a0);
      var B = [bx, cy - h/2, bz], T = [tx, cy + h/2, tz];
      var mid = (a0 + a1) / 2;
      var hint = [Math.cos(mid), 0, Math.sin(mid)];
      if (prevB) this.quad(prevB, B, T, prevT, hint, col);
      prevB = B; prevT = T;
    }
    var mid = (((seg - 1) + 0.5) / seg) * Math.PI * 2;
    var firstB = [cx + rBottom * Math.cos(0), cy - h/2, cz + rBottom * Math.sin(0)];
    var firstT = [cx + rTop * Math.cos(0), cy + h/2, cz + rTop * Math.sin(0)];
    this.quad(prevB, firstB, firstT, prevT, [Math.cos(mid), 0, Math.sin(mid)], col);
    if (caps) {
      var rb = [];
      for (j = 0; j < seg; j++) {
        var a = (j / seg) * Math.PI * 2;
        rb.push([cx + rBottom * Math.cos(a), cy - h/2, cz + rBottom * Math.sin(a)]);
      }
      this.fan([cx, cy - h/2, cz], rb, [0, -1, 0], col);
      var rt = [];
      for (j = 0; j < seg; j++) {
        var a2 = (j / seg) * Math.PI * 2;
        rt.push([cx + rTop * Math.cos(a2), cy + h/2, cz + rTop * Math.sin(a2)]);
      }
      this.fan([cx, cy + h/2, cz], rt, [0, 1, 0], col);
    }
  };
  Builder.prototype.sphere = function (cx, cy, cz, r, seg, col, sy) {
    seg = seg || 10;
    sy = sy || 1;
    var rings = Math.max(2, Math.round(seg * 0.55));
    var j, i;
    var prevRing = null;
    for (j = 0; j <= rings; j++) {
      var phi = (j / rings) * Math.PI;
      var yy = Math.cos(phi) * r * sy;
      var rad = Math.sin(phi) * r;
      var ring = [];
      for (i = 0; i < seg; i++) {
        var th = (i / seg) * Math.PI * 2;
        ring.push([cx + rad * Math.cos(th), cy + yy, cz + rad * Math.sin(th)]);
      }
      if (prevRing) {
        for (i = 0; i < seg; i++) {
          var mid = ((i + 0.5) / seg) * Math.PI * 2;
          var hint = [Math.cos(mid), 0.7, Math.sin(mid)];
          var a = prevRing[i], b = prevRing[(i + 1) % seg], c = ring[(i + 1) % seg], d = ring[i];
          this.quad(a, b, c, d, hint, col);
        }
      }
      prevRing = ring;
    }
  };
  Builder.prototype.plane = function (cx, cy, cz, w, d, col, hint) {
    var x0 = cx - w/2, x1 = cx + w/2, z0 = cz - d/2, z1 = cz + d/2;
    this.quad([x0, cy, z1], [x1, cy, z1], [x1, cy, z0], [x0, cy, z0], hint || [0, 1, 0], col);
  };
  Builder.prototype.gridPlane = function (cx, cy, cz, w, d, cell, col, noise, rng) {
    // subdivided plane with per-vertex color jitter
    var nx = Math.ceil(w / cell), nz = Math.ceil(d / cell);
    var x0 = cx - w/2, z0 = cz - d/2;
    var stepX = w / nx, stepZ = d / nz;
    for (var i = 0; i < nx; i++) {
      for (var j = 0; j < nz; j++) {
        var xa = x0 + i * stepX, xb = xa + stepX, za = z0 + j * stepZ, zb = za + stepZ;
        var jx1 = (rng ? rng(i * 13.7 + j * 7.1) : 0.5);
        var jx2 = (rng ? rng(i * 3.3 + j * 17.9) : 0.5);
        var jx3 = (rng ? rng(i * 11.1 + j * 3.7 + 2.0) : 0.5);
        var jx4 = (rng ? rng(i * 5.9 + j * 9.3 + 1.0) : 0.5);
        var n = noise || 0;
        var c1 = [col[0] * (1 - n + jx1 * n * 2), col[1] * (1 - n + jx1 * n * 2), col[2] * (1 - n + jx1 * n * 2)];
        var c2 = [col[0] * (1 - n + jx2 * n * 2), col[1] * (1 - n + jx2 * n * 2), col[2] * (1 - n + jx2 * n * 2)];
        var c3 = [col[0] * (1 - n + jx3 * n * 2), col[1] * (1 - n + jx3 * n * 2), col[2] * (1 - n + jx3 * n * 2)];
        var c4 = [col[0] * (1 - n + jx4 * n * 2), col[1] * (1 - n + jx4 * n * 2), col[2] * (1 - n + jx4 * n * 2)];
        this.quad([xa, cy, za], [xb, cy, za], [xb, cy, zb], [xa, cy, zb], [0, 1, 0], [c1, c2, c3, c4]);
      }
    }
  };
  Builder.prototype.build = function () {
    var n = this.pos.length / 3;
    var idx = this.idx;
    var needUint = n >= 65536;
    var indexType = needUint ? (uintExt ? Uint32Array : Uint16Array) : Uint16Array;
    if (needUint && !uintExt) throw new Error('too many vertices');
    return {
      pos: new Float32Array(this.pos),
      nrm: new Float32Array(this.nrm),
      col: new Float32Array(this.col),
      uv: new Float32Array(this.uv),
      idx: new indexType(idx),
      count: idx.length
    };
  };

  /* ---------------- shaders ---------------- */
  function compileShader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('Shader error: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }
  function createProgram(vsSrc, fsSrc) {
    var p = gl.createProgram();
    gl.attachShader(p, compileShader(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program link error: ' + gl.getProgramInfoLog(p));
    p._uniformLocs = {};
    return p;
  }

  var MAIN_VS = `
attribute vec3 aPos;
attribute vec3 aNorm;
attribute vec3 aColor;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat3 uNormal;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(uNormal * aNorm);
  vColor = aColor;
  gl_Position = uViewProj * wp;
}`;
  var MAIN_FS = `
precision highp float;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;
uniform float uAmbient;
uniform float uInteriorBoost;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uFogColor;
uniform vec3 uCamPos;
void main() {
  vec3 N = normalize(vNormal);
  float diff = max(dot(N, uSunDir), 0.0);
  float hemi = N.y * 0.5 + 0.5;
  vec3 amb = mix(uGroundColor, uSkyColor, hemi) * uAmbient;
  vec3 col = vColor * amb;
  col += vColor * diff * uSunColor;
  col += vColor * uInteriorBoost;
  float d = length(vWorldPos - uCamPos);
  float fog = smoothstep(uFogNear, uFogFar, d);
  col = mix(col, uFogColor, fog);
  gl_FragColor = vec4(col, 1.0);
}`;
  var GLASS_VS = `
attribute vec3 aPos;
attribute vec3 aNorm;
uniform mat4 uViewProj;
uniform mat4 uModel;
uniform mat3 uNormal;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(uNormal * aNorm);
  gl_Position = uViewProj * wp;
}`;
  var GLASS_FS = `
precision highp float;
varying vec3 vWorldPos;
varying vec3 vNormal;
uniform vec3 uCamPos;
uniform vec3 uGlassTint;
uniform float uGlassAlpha;
uniform float uGlassFresnel;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorldPos);
  float fr = pow(1.0 - abs(dot(V, N)), 3.0);
  vec3 col = mix(uGlassTint, vec3(1.0), fr * 0.45);
  float alpha = uGlassAlpha + fr * uGlassFresnel;
  gl_FragColor = vec4(col, alpha);
}`;
  var SKY_VS = `
attribute vec3 aPos;
uniform mat4 uViewProj;
uniform mat4 uModel;
varying vec3 vDir;
void main() {
  vDir = aPos;
  vec4 wp = uModel * vec4(aPos, 1.0);
  gl_Position = uViewProj * wp;
}`;
  var SKY_FS = `
precision highp float;
varying vec3 vDir;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunColor;
uniform float uNightFactor;
uniform float uTime;
float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
}
void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  vec3 col = mix(uHorizon, uZenith, pow(max(h, 0.0), 0.58));
  if (h < 0.0) col = uHorizon * (1.0 + h * 0.6);
  float s = max(dot(dir, uSunDir), 0.0);
  float sunDisc = smoothstep(0.968, 0.975, s);
  float sunHalo = pow(s, 90.0) * 0.85;
  col += uSunColor * (sunDisc * 1.6 + sunHalo);
  float m = max(dot(dir, uMoonDir), 0.0);
  float moonDisc = smoothstep(0.988, 0.993, m);
  float moonHalo = pow(m, 220.0) * 0.7;
  col += vec3(0.86, 0.90, 1.0) * (moonDisc * 1.9 + moonHalo) * uNightFactor;
  float warm = pow(max(dot(dir, normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0), 3.0);
  col += uSunColor * warm * smoothstep(0.40, 0.03, abs(h)) * (1.0 - uNightFactor) * 0.5;
  vec3 sp = floor(dir * 165.0);
  float star = step(0.9945, hash3(sp));
  star *= smoothstep(0.02, 0.18, h);
  float twinkle = 0.65 + 0.35 * sin(uTime * 3.0 + hash3(sp + 1.7) * 20.0);
  col += vec3(1.0, 0.98, 0.9) * star * twinkle * uNightFactor;
  gl_FragColor = vec4(col, 1.0);
}`;
  var GLOW_VS = `
attribute vec3 aPos;
attribute vec3 aColor;
uniform mat4 uViewProj;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;
  var GLOW_FS = `
precision highp float;
varying vec3 vColor;
uniform float uAlpha;
void main() {
  gl_FragColor = vec4(vColor * uAlpha, uAlpha);
}`;
  var TEXTURE_VS = `
attribute vec3 aPos;
attribute vec2 aUV;
uniform mat4 uViewProj;
uniform mat4 uModel;
varying vec2 vUV;
varying vec3 vWorldPos;
void main() {
  vUV = aUV;
  vec4 wp = uModel * vec4(aPos, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = uViewProj * wp;
}`;
  var TEXTURE_FS = `
precision highp float;
varying vec2 vUV;
varying vec3 vWorldPos;
uniform sampler2D uTex;
uniform float uBrightness;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uFogColor;
uniform vec3 uCamPos;
void main() {
  vec4 tex = texture2D(uTex, vUV);
  vec3 col = tex.rgb * uBrightness;
  float d = length(vWorldPos - uCamPos);
  float fog = smoothstep(uFogNear, uFogFar, d);
  col = mix(col, uFogColor, fog);
  gl_FragColor = vec4(col, 1.0);
}`;
  var SHADOW_VS = `
attribute vec3 aPos;
uniform mat4 uViewProj;
void main() {
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;
  var SHADOW_FS = `
precision highp float;
uniform float uAlpha;
void main() {
  gl_FragColor = vec4(0.0, 0.0, 0.0, uAlpha);
}`;

  var progMain = createProgram(MAIN_VS, MAIN_FS);
  var progGlass = createProgram(GLASS_VS, GLASS_FS);
  var progSky = createProgram(SKY_VS, SKY_FS);
  var progGlow = createProgram(GLOW_VS, GLOW_FS);
  var progTexture = createProgram(TEXTURE_VS, TEXTURE_FS);
  var progShadow = createProgram(SHADOW_VS, SHADOW_FS);

  /* ---------------- meshes ---------------- */
  function makeMesh(geo) {
    var m = {
      pos: gl.createBuffer(), nrm: gl.createBuffer(), col: gl.createBuffer(),
      uv: gl.createBuffer(), idx: geo.idx ? gl.createBuffer() : null,
      count: geo.idx ? geo.count : 0,
      indexType: geo.idx ? (geo.idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT) : null
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
    gl.bufferData(gl.ARRAY_BUFFER, geo.pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nrm);
    gl.bufferData(gl.ARRAY_BUFFER, geo.nrm, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.col);
    gl.bufferData(gl.ARRAY_BUFFER, geo.col, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.uv);
    gl.bufferData(gl.ARRAY_BUFFER, geo.uv, gl.STATIC_DRAW);
    if (m.idx) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW);
    }
    return m;
  }
  function makeTexturedMesh(geo) {
    var m = {
      pos: gl.createBuffer(), uv: gl.createBuffer(),
      idx: geo.idx ? gl.createBuffer() : null,
      count: geo.idx ? geo.count : 0,
      indexType: geo.idx ? (geo.idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT) : null
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
    gl.bufferData(gl.ARRAY_BUFFER, geo.pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.uv);
    gl.bufferData(gl.ARRAY_BUFFER, geo.uv, gl.STATIC_DRAW);
    if (m.idx) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.idx, gl.STATIC_DRAW);
    }
    return m;
  }

  /* dynamic mesh — reusable scratch buffers; push into them frame-by-frame */
  function dynMesh(maxVerts) {
    var m = {
      pos: gl.createBuffer(), nrm: gl.createBuffer(), col: gl.createBuffer(),
      uv: gl.createBuffer(),
      idx: gl.createBuffer(),
      vertexCount: 0, count: 0,
      _maxVerts: maxVerts,
      _pos: new Float32Array(maxVerts * 3),
      _nrm: new Float32Array(maxVerts * 3),
      _col: new Float32Array(maxVerts * 3),
      _uv: new Float32Array(maxVerts * 2),
      _idx: new Uint16Array(maxVerts * 6),
      _nPos: 0, _nIdx: 0
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
    gl.bufferData(gl.ARRAY_BUFFER, bufBytes(m._pos), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nrm);
    gl.bufferData(gl.ARRAY_BUFFER, bufBytes(m._nrm), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.col);
    gl.bufferData(gl.ARRAY_BUFFER, bufBytes(m._col), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.uv);
    gl.bufferData(gl.ARRAY_BUFFER, bufBytes(m._uv), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, bufBytes(m._idx), gl.DYNAMIC_DRAW);
    return m;
    function bufBytes(t) { return t.byteLength; }
  }
  function dynReset(m) {
    m._nPos = 0; m._nIdx = 0;
  }
  function dynQuad(m, a, b, c, d, hint, col, uvs) {
    if (m._nPos + 4 > m._maxVerts) throw new Error('dynMesh overflow');
    var ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
    var ac = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
    var nx = ab[1]*ac[2] - ab[2]*ac[1];
    var ny = ab[2]*ac[0] - ab[0]*ac[2];
    var nz = ab[0]*ac[1] - ab[1]*ac[0];
    var len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
    nx /= len; ny /= len; nz /= len;
    var flipped = hint && (nx*hint[0] + ny*hint[1] + nz*hint[2]) < 0;
    if (flipped) { nx = -nx; ny = -ny; nz = -nz; }
    var base = m._nPos;
    var verts = [a, b, c, d];
    var uv = uvs || [[0,0],[1,0],[1,1],[0,1]];
    for (var i = 0; i < 4; i++) {
      m._pos[m._nPos * 3] = verts[i][0]; m._pos[m._nPos * 3 + 1] = verts[i][1]; m._pos[m._nPos * 3 + 2] = verts[i][2];
      m._nrm[m._nPos * 3] = nx; m._nrm[m._nPos * 3 + 1] = ny; m._nrm[m._nPos * 3 + 2] = nz;
      m._col[m._nPos * 3] = col[0]; m._col[m._nPos * 3 + 1] = col[1]; m._col[m._nPos * 3 + 2] = col[2];
      m._uv[m._nPos * 2] = uv[i][0]; m._uv[m._nPos * 2 + 1] = uv[i][1];
      m._nPos++;
    }
    if (flipped) {
      m._idx[m._nIdx++] = base; m._idx[m._nIdx++] = base+2; m._idx[m._nIdx++] = base+1;
      m._idx[m._nIdx++] = base; m._idx[m._nIdx++] = base+3; m._idx[m._nIdx++] = base+2;
    } else {
      m._idx[m._nIdx++] = base; m._idx[m._nIdx++] = base+1; m._idx[m._nIdx++] = base+2;
      m._idx[m._nIdx++] = base; m._idx[m._nIdx++] = base+2; m._idx[m._nIdx++] = base+3;
    }
  }
  function dynBox(m, cx, cy, cz, w, h, d, col, rotX, pivotY, pivotZ) {
    // optional rotation about X axis at (0, pivotY, pivotZ) — pivot around X-axis line
    var cos = 1, sin = 0;
    if (rotX) { cos = Math.cos(rotX); sin = Math.sin(rotX); }
    var x0 = cx-w/2, x1 = cx+w/2, y0 = cy-h/2, y1 = cy+h/2, z0 = cz-d/2, z1 = cz+d/2;
    var pY = pivotY === undefined ? cy : pivotY;
    var pZ = pivotZ === undefined ? cz : pivotZ;
    function T(x, y, z) {
      if (!rotX) return [x, y, z];
      var dy = y - pY, dz = z - pZ;
      return [x, pY + dy * cos - dz * sin, pZ + dy * sin + dz * cos];
    }
    function Tn(nx, ny, nz) {
      if (!rotX) return [nx, ny, nz];
      return [nx, ny * cos - nz * sin, ny * sin + nz * cos];
    }
    var A = T(x0, y0, z1), B = T(x1, y0, z1), C = T(x1, y1, z1), D = T(x0, y1, z1);
    var E = T(x1, y0, z0), F = T(x0, y0, z0), G = T(x0, y1, z0), H = T(x1, y1, z0);
    var nFront = Tn(0, 0, 1), nBack = Tn(0, 0, -1), nRight = Tn(1, 0, 0), nLeft = Tn(-1, 0, 0);
    var nTop = Tn(0, 1, 0), nBottom = Tn(0, -1, 0);
    dynQuad(m, A, B, C, D, nFront, col);
    dynQuad(m, E, F, G, H, nBack, col);
    dynQuad(m, B, E, H, C, nRight, col);
    dynQuad(m, F, A, D, G, nLeft, col);
    dynQuad(m, D, C, H, G, nTop, col);
    dynQuad(m, F, E, B, A, nBottom, col);
  }
  function dynGlowMesh(maxVerts) {
    var m = {
      pos: gl.createBuffer(), col: gl.createBuffer(), idx: gl.createBuffer(),
      vertexCount: 0, count: 0,
      _maxVerts: maxVerts,
      _pos: new Float32Array(maxVerts * 3),
      _col: new Float32Array(maxVerts * 3),
      _idx: new Uint16Array(maxVerts * 6),
      _nPos: 0, _nIdx: 0
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
    gl.bufferData(gl.ARRAY_BUFFER, m._pos.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.col);
    gl.bufferData(gl.ARRAY_BUFFER, m._col.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m._idx.byteLength, gl.DYNAMIC_DRAW);
    return m;
  }
  function dynGlowQuad(m, a, b, c, d, col) {
    if (m._nPos + 4 > m._maxVerts) throw new Error('glow mesh overflow');
    var base = m._nPos;
    var verts = [a, b, c, d];
    for (var i = 0; i < 4; i++) {
      m._pos[m._nPos * 3] = verts[i][0]; m._pos[m._nPos * 3 + 1] = verts[i][1]; m._pos[m._nPos * 3 + 2] = verts[i][2];
      m._col[m._nPos * 3] = col[0]; m._col[m._nPos * 3 + 1] = col[1]; m._col[m._nPos * 3 + 2] = col[2];
      m._nPos++;
    }
    m._idx[m._nIdx++] = base; m._idx[m._nIdx++] = base+1; m._idx[m._nIdx++] = base+2;
    m._idx[m._nIdx++] = base; m._idx[m._nIdx++] = base+2; m._idx[m._nIdx++] = base+3;
  }
  function dynGlowBox(m, cx, cy, cz, w, h, d, col) {
    var x0 = cx-w/2, x1 = cx+w/2, y0 = cy-h/2, y1 = cy+h/2, z0 = cz-d/2, z1 = cz+d/2;
    dynGlowQuad(m, [x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1], col);
    dynGlowQuad(m, [x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0], col);
    dynGlowQuad(m, [x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1], col);
    dynGlowQuad(m, [x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0], col);
    dynGlowQuad(m, [x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0], col);
    dynGlowQuad(m, [x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1], col);
  }
  function dynGlowFlush(m, dynamic) {
    m.vertexCount = m._nPos;
    m.count = m._nIdx;
    if (!m._nPos) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
    gl.bufferData(gl.ARRAY_BUFFER, m._pos.subarray(0, m._nPos * 3), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.col);
    gl.bufferData(gl.ARRAY_BUFFER, m._col.subarray(0, m._nPos * 3), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m._idx.subarray(0, m._nIdx), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  }
  function dynFlush(m, dynamic) {
    m.vertexCount = m._nPos;
    m.count = m._nIdx;
    if (!m._nPos) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
    gl.bufferData(gl.ARRAY_BUFFER, m._pos.subarray(0, m._nPos * 3), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.nrm);
    gl.bufferData(gl.ARRAY_BUFFER, m._nrm.subarray(0, m._nPos * 3), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.col);
    gl.bufferData(gl.ARRAY_BUFFER, m._col.subarray(0, m._nPos * 3), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.uv);
    gl.bufferData(gl.ARRAY_BUFFER, m._uv.subarray(0, m._nPos * 2), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m._idx.subarray(0, m._nIdx), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
  }

  /* ---------------- textures ---------------- */
  function makeTextureFromCanvas(cv) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    return t;
  }

  /* ---------------- drawing ---------------- */
  function setUniforms(program, values) {
    gl.useProgram(program);
    for (var name in values) {
      var v = values[name];
      var loc = program._uniformLocs[name];
      if (loc === undefined) {
        loc = gl.getUniformLocation(program, name);
        program._uniformLocs[name] = loc;
      }
      if (loc === null) continue;
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (Array.isArray(v) || v instanceof Float32Array) {
        if (v.length === 2) gl.uniform2fv(loc, v);
        else if (v.length === 3) gl.uniform3fv(loc, v);
        else if (v.length === 16) gl.uniformMatrix4fv(loc, false, v);
        else if (v.length === 9) gl.uniformMatrix3fv(loc, false, v);
      }
    }
  }

  function drawMain(mesh, uniforms, opts) {
    opts = opts || {};
    setUniforms(progMain, uniforms);
    var loc;
    loc = gl.getAttribLocation(progMain, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    loc = gl.getAttribLocation(progMain, 'aNorm');
    gl.enableVertexAttribArray(loc);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrm);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    loc = gl.getAttribLocation(progMain, 'aColor');
    gl.enableVertexAttribArray(loc);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.col);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    if (opts.doubleSided) gl.disable(gl.CULL_FACE);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType === gl.UNSIGNED_INT ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
  }

  function drawGlass(mesh, uniforms) {
    setUniforms(progGlass, uniforms);
    var loc;
    loc = gl.getAttribLocation(progGlass, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    loc = gl.getAttribLocation(progGlass, 'aNorm');
    gl.enableVertexAttribArray(loc);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nrm);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType === gl.UNSIGNED_INT ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
  }

  function drawSky(mesh, uniforms) {
    setUniforms(progSky, uniforms);
    var loc = gl.getAttribLocation(progSky, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType === gl.UNSIGNED_INT ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
  }

  function drawGlow(mesh, uniforms) {
    setUniforms(progGlow, uniforms);
    var loc = gl.getAttribLocation(progGlow, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    loc = gl.getAttribLocation(progGlow, 'aColor');
    gl.enableVertexAttribArray(loc);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.col);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType === gl.UNSIGNED_INT ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
  }

  function drawShadow(mesh, uniforms) {
    setUniforms(progShadow, uniforms);
    var loc = gl.getAttribLocation(progShadow, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType === gl.UNSIGNED_INT ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
  }

  function drawTexture(mesh, uniforms, tex, model) {
    setUniforms(progTexture, uniforms);
    var loc2 = gl.getUniformLocation(progTexture, 'uModel');
    gl.uniformMatrix4fv(loc2, false, model || IDENTITY_MODEL);
    var loc = gl.getAttribLocation(progTexture, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pos);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    loc = gl.getAttribLocation(progTexture, 'aUV');
    gl.enableVertexAttribArray(loc);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uv);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.enable(gl.TEXTURE_2D);
    gl.disable(gl.CULL_FACE);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl.drawElements(gl.TRIANGLES, mesh.count, mesh.indexType === gl.UNSIGNED_INT ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, 0);
    gl.disable(gl.TEXTURE_2D);
    gl.enable(gl.CULL_FACE);
  }

  function resizeCanvas() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
    return { w: w, h: h, dpr: dpr };
  }

  return {
    canvas: canvas, gl: gl,
    mat4Camera: mat4Camera, mat4Perspective: mat4Perspective,
    mat4Mul: mat4Mul, mat3FromModel: mat3FromModel,
    cameraToMatrices: cameraToMatrices,
    mat4Identity: function () { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
    IDENTITY_MODEL: IDENTITY_MODEL,
    Builder: Builder,
    makeMesh: makeMesh, makeTexturedMesh: makeTexturedMesh,
    makeTextureFromCanvas: makeTextureFromCanvas,
    dynMesh: dynMesh, dynReset: dynReset, dynQuad: dynQuad, dynBox: dynBox, dynFlush: dynFlush,
    dynGlowMesh: dynGlowMesh, dynGlowQuad: dynGlowQuad, dynGlowBox: dynGlowBox, dynGlowFlush: dynGlowFlush,
    drawMain: drawMain, drawGlass: drawGlass, drawSky: drawSky,
    drawGlow: drawGlow, drawShadow: drawShadow, drawTexture: drawTexture,
    resizeCanvas: resizeCanvas
  };
})();
