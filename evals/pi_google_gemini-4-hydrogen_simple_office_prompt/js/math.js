(function (global) {
  'use strict';

  var OfficeSim = global.OfficeSim = global.OfficeSim || {};

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(edge0, edge1, x) {
    var t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function lerpColor(c1, c2, t) {
    return [
      lerp(c1[0], c2[0], t),
      lerp(c1[1], c2[1], t),
      lerp(c1[2], c2[2], t)
    ];
  }

  // Deterministic PRNG (Mulberry32)
  function createRNG(seed) {
    var s = seed >>> 0;
    return function () {
      s += 0x6D2B79F5;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Vector3 helpers
  var Vec3 = {
    create: function (x, y, z) { return [x || 0, y || 0, z || 0]; },
    sub: function (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
    add: function (a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
    scale: function (a, s) { return [a[0] * s, a[1] * s, a[2] * s]; },
    dot: function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
    cross: function (a, b) {
      return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
      ];
    },
    len: function (a) { return Math.hypot(a[0], a[1], a[2]); },
    norm: function (a) {
      var l = Math.hypot(a[0], a[1], a[2]) || 1;
      return [a[0] / l, a[1] / l, a[2] / l];
    },
    dist: function (a, b) {
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    }
  };

  // Column-major 4x4 Matrix helpers
  var Mat4 = {
    create: function () {
      var out = new Float32Array(16);
      out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
      return out;
    },
    identity: function (out) {
      out.fill(0);
      out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
      return out;
    },
    perspective: function (out, fovyRad, aspect, near, far) {
      var f = 1.0 / Math.tan(fovyRad / 2);
      var nf = 1 / (near - far);
      out.fill(0);
      out[0] = f / aspect;
      out[5] = f;
      out[10] = (far + near) * nf;
      out[11] = -1;
      out[14] = 2 * far * near * nf;
      return out;
    },
    lookAt: function (out, eye, center, up) {
      var z0 = eye[0] - center[0], z1 = eye[1] - center[1], z2 = eye[2] - center[2];
      var len = Math.hypot(z0, z1, z2) || 1;
      z0 /= len; z1 /= len; z2 /= len;

      var x0 = up[1] * z2 - up[2] * z1;
      var x1 = up[2] * z0 - up[0] * z2;
      var x2 = up[0] * z1 - up[1] * z0;
      len = Math.hypot(x0, x1, x2);
      if (len) { x0 /= len; x1 /= len; x2 /= len; }

      var y0 = z1 * x2 - z2 * x1;
      var y1 = z2 * x0 - z0 * x2;
      var y2 = z0 * x1 - z1 * x0;

      out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
      out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
      out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
      out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
      out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
      out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
      out[15] = 1;
      return out;
    },
    multiply: function (out, a, b) {
      var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

      for (var i = 0; i < 4; i++) {
        var b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
        out[i * 4]     = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
      }
      return out;
    },
    invert: function (out, a) {
      var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
      var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
      var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
      var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

      var b00 = a00 * a11 - a01 * a10;
      var b01 = a00 * a12 - a02 * a10;
      var b02 = a00 * a13 - a03 * a10;
      var b03 = a01 * a12 - a02 * a11;
      var b04 = a01 * a13 - a03 * a11;
      var b05 = a02 * a13 - a03 * a12;
      var b06 = a20 * a31 - a21 * a30;
      var b07 = a20 * a32 - a22 * a30;
      var b08 = a20 * a33 - a23 * a30;
      var b09 = a21 * a32 - a22 * a31;
      var b10 = a21 * a33 - a23 * a31;
      var b11 = a22 * a33 - a23 * a32;

      var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      if (!det) return null;
      det = 1.0 / det;

      out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
      out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
      out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
      out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
      out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
      out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
      out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
      out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
      out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
      out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
      out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
      out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
      out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
      out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
      out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
      out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
      return out;
    },
    fromTRS: function (out, tx, ty, tz, ry, sx, sy, sz) {
      var c = Math.cos(ry || 0);
      var s = Math.sin(ry || 0);
      out[0] = c * sx;  out[1] = 0;  out[2] = -s * sx; out[3] = 0;
      out[4] = 0;       out[5] = sy; out[6] = 0;       out[7] = 0;
      out[8] = s * sz;  out[9] = 0;  out[10] = c * sz; out[11] = 0;
      out[12] = tx;     out[13] = ty; out[14] = tz;    out[15] = 1;
      return out;
    },
    fromTRSX: function (out, tx, ty, tz, rx, ry, sx, sy, sz) {
      var cy = Math.cos(ry || 0), sy_ = Math.sin(ry || 0);
      var cx = Math.cos(rx || 0), sx_ = Math.sin(rx || 0);
      // R = Ry * Rx
      out[0] = cy * sx;
      out[1] = 0;
      out[2] = -sy_ * sx;
      out[3] = 0;

      out[4] = sy_ * sx_ * sy;
      out[5] = cx * sy;
      out[6] = cy * sx_ * sy;
      out[7] = 0;

      out[8] = sy_ * cx * sz;
      out[9] = -sx_ * sz;
      out[10] = cy * cx * sz;
      out[11] = 0;

      out[12] = tx;
      out[13] = ty;
      out[14] = tz;
      out[15] = 1;
      return out;
    }
  };

  // Screen-to-World Ray and Ray-AABB intersection
  function unprojectRay(ndcX, ndcY, invViewProj) {
    function transformPoint(x, y, z) {
      var m = invViewProj;
      var w = m[3] * x + m[7] * y + m[11] * z + m[15];
      return [
        (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
        (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
        (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
      ];
    }
    var nearPt = transformPoint(ndcX, ndcY, -1);
    var farPt = transformPoint(ndcX, ndcY, 1);
    var dir = Vec3.norm(Vec3.sub(farPt, nearPt));
    return { origin: nearPt, dir: dir };
  }

  function intersectRayAABB(origin, dir, minB, maxB) {
    var tmin = -Infinity, tmax = Infinity;
    for (var i = 0; i < 3; i++) {
      var invD = Math.abs(dir[i]) > 1e-6 ? 1.0 / dir[i] : 1e6;
      var t0 = (minB[i] - origin[i]) * invD;
      var t1 = (maxB[i] - origin[i]) * invD;
      if (t0 > t1) { var tmp = t0; t0 = t1; t1 = tmp; }
      if (t0 > tmin) tmin = t0;
      if (t1 < tmax) tmax = t1;
      if (tmax < tmin) return null;
    }
    return tmin >= 0 ? tmin : (tmax >= 0 ? tmax : null);
  }

  OfficeSim.Math = {
    clamp: clamp,
    lerp: lerp,
    smoothstep: smoothstep,
    lerpColor: lerpColor,
    createRNG: createRNG,
    Vec3: Vec3,
    Mat4: Mat4,
    unprojectRay: unprojectRay,
    intersectRayAABB: intersectRayAABB
  };
})(window);
