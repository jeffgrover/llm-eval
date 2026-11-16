(function (global) {
  'use strict';

  var OfficeSim = global.OfficeSim = global.OfficeSim || {};
  var Mat4 = OfficeSim.Math.Mat4;

  var VS_SOURCE = [
    'attribute vec3 aPos;',
    'attribute vec3 aNormal;',
    'attribute vec2 aUV;',
    'uniform mat4 uModel;',
    'uniform mat4 uViewProj;',
    'uniform vec2 uUVScale;',
    'varying vec3 vWorldPos;',
    'varying vec3 vNormal;',
    'varying vec2 vUV;',
    'void main() {',
    '  vec4 wp = uModel * vec4(aPos, 1.0);',
    '  vWorldPos = wp.xyz;',
    '  vNormal = normalize(mat3(uModel) * aNormal);',
    '  vUV = aUV * uUVScale;',
    '  gl_Position = uViewProj * wp;',
    '}'
  ].join('\n');

  var FS_SOURCE = [
    'precision mediump float;',
    'varying vec3 vWorldPos;',
    'varying vec3 vNormal;',
    'varying vec2 vUV;',
    'uniform sampler2D uTex;',
    'uniform vec4 uColor;',
    'uniform vec3 uEmissive;',
    'uniform float uShininess;',
    'uniform float uIndoorGlow;',
    'uniform vec3 uSunDir;',
    'uniform vec3 uSunColor;',
    'uniform vec3 uSkyColor;',
    'uniform vec3 uGroundColor;',
    'uniform vec3 uFogColor;',
    'uniform float uFogDensity;',
    'uniform vec3 uCamPos;',
    'void main() {',
    '  vec3 N = normalize(vNormal);',
    '  vec3 V = normalize(uCamPos - vWorldPos);',
    '  vec4 texel = texture2D(uTex, vUV);',
    '  vec3 albedo = texel.rgb * uColor.rgb;',
    '  float alpha = texel.a * uColor.a;',
    '  float hemi = 0.5 + 0.5 * N.y;',
    '  vec3 ambient = mix(uGroundColor, uSkyColor, hemi);',
    '  float diff = max(dot(N, uSunDir), 0.0);',
    '  vec3 H = normalize(uSunDir + V);',
    '  float spec = pow(max(dot(N, H), 0.0), max(uShininess, 1.0)) * (uShininess > 2.0 ? 0.35 : 0.05);',
    '  vec3 indoorLight = vec3(1.0, 0.92, 0.78) * uIndoorGlow * (0.45 + 0.35 * abs(N.y));',
    '  vec3 color = albedo * (ambient + uSunColor * diff + indoorLight) + uSunColor * spec + uEmissive;',
    '  float dist = length(uCamPos - vWorldPos);',
    '  float fogFactor = 1.0 - exp(-pow(dist * uFogDensity, 2.0));',
    '  color = mix(color, uFogColor, clamp(fogFactor, 0.0, 0.92));',
    '  gl_FragColor = vec4(color, alpha);',
    '}'
  ].join('\n');

  function compileShader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  // Geometry builders
  function buildBoxGeo() {
    // Unit cube centered at origin (-0.5..0.5)
    var p = [
      // +Z
      -0.5,-0.5, 0.5,  0.5,-0.5, 0.5,  0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
      // -Z
       0.5,-0.5,-0.5, -0.5,-0.5,-0.5, -0.5, 0.5,-0.5,  0.5, 0.5,-0.5,
      // +Y
      -0.5, 0.5, 0.5,  0.5, 0.5, 0.5,  0.5, 0.5,-0.5, -0.5, 0.5,-0.5,
      // -Y
      -0.5,-0.5,-0.5,  0.5,-0.5,-0.5,  0.5,-0.5, 0.5, -0.5,-0.5, 0.5,
      // +X
       0.5,-0.5, 0.5,  0.5,-0.5,-0.5,  0.5, 0.5,-0.5,  0.5, 0.5, 0.5,
      // -X
      -0.5,-0.5,-0.5, -0.5,-0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5,-0.5
    ];
    var n = [
      0,0,1, 0,0,1, 0,0,1, 0,0,1,
      0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,
      0,1,0, 0,1,0, 0,1,0, 0,1,0,
      0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,
      1,0,0, 1,0,0, 1,0,0, 1,0,0,
      -1,0,0, -1,0,0, -1,0,0, -1,0,0
    ];
    var uv = [];
    for (var i = 0; i < 6; i++) uv.push(0,0, 1,0, 1,1, 0,1);
    var idx = [];
    for (var f = 0; f < 6; f++) {
      var o = f * 4;
      idx.push(o, o+1, o+2, o, o+2, o+3);
    }
    return { pos: p, norm: n, uv: uv, idx: idx };
  }

  function buildCylinderGeo(segs) {
    var pos = [], norm = [], uv = [], idx = [];
    // Side
    for (var i = 0; i <= segs; i++) {
      var a = (i / segs) * Math.PI * 2;
      var x = Math.cos(a) * 0.5, z = Math.sin(a) * 0.5;
      var nx = Math.cos(a), nz = Math.sin(a);
      pos.push(x, -0.5, z, x, 0.5, z);
      norm.push(nx, 0, nz, nx, 0, nz);
      uv.push(i / segs, 0, i / segs, 1);
    }
    for (var i = 0; i < segs; i++) {
      var o = i * 2;
      idx.push(o, o+2, o+1, o+1, o+2, o+3);
    }
    // Top & bottom caps
    var topCenter = pos.length / 3;
    pos.push(0, 0.5, 0); norm.push(0, 1, 0); uv.push(0.5, 0.5);
    for (var i = 0; i <= segs; i++) {
      var a = (i / segs) * Math.PI * 2;
      pos.push(Math.cos(a)*0.5, 0.5, Math.sin(a)*0.5);
      norm.push(0, 1, 0); uv.push(0.5 + Math.cos(a)*0.5, 0.5 + Math.sin(a)*0.5);
    }
    for (var i = 0; i < segs; i++) {
      idx.push(topCenter, topCenter + 1 + i + 1, topCenter + 1 + i);
    }
    var botCenter = pos.length / 3;
    pos.push(0, -0.5, 0); norm.push(0, -1, 0); uv.push(0.5, 0.5);
    for (var i = 0; i <= segs; i++) {
      var a = (i / segs) * Math.PI * 2;
      pos.push(Math.cos(a)*0.5, -0.5, Math.sin(a)*0.5);
      norm.push(0, -1, 0); uv.push(0.5 + Math.cos(a)*0.5, 0.5 + Math.sin(a)*0.5);
    }
    for (var i = 0; i < segs; i++) {
      idx.push(botCenter, botCenter + 1 + i, botCenter + 1 + i + 1);
    }
    return { pos: pos, norm: norm, uv: uv, idx: idx };
  }

  function buildSphereGeo(lat, lon) {
    var pos = [], norm = [], uv = [], idx = [];
    for (var y = 0; y <= lat; y++) {
      var v = y / lat;
      var phi = v * Math.PI;
      for (var x = 0; x <= lon; x++) {
        var u = x / lon;
        var theta = u * Math.PI * 2;
        var nx = -Math.cos(theta) * Math.sin(phi);
        var ny = Math.cos(phi);
        var nz = Math.sin(theta) * Math.sin(phi);
        pos.push(nx * 0.5, ny * 0.5, nz * 0.5);
        norm.push(nx, ny, nz);
        uv.push(u, v);
      }
    }
    for (var y = 0; y < lat; y++) {
      for (var x = 0; x < lon; x++) {
        var a = y * (lon + 1) + x;
        var b = a + lon + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return { pos: pos, norm: norm, uv: uv, idx: idx };
  }

  function uploadMesh(gl, data) {
    var posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.pos), gl.STATIC_DRAW);

    var normBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.norm), gl.STATIC_DRAW);

    var uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.uv), gl.STATIC_DRAW);

    var idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.idx), gl.STATIC_DRAW);

    return { posBuf: posBuf, normBuf: normBuf, uvBuf: uvBuf, idxBuf: idxBuf, count: data.idx.length };
  }

  // Procedural Textures
  function createCanvasTex(gl, size, drawFn, repeat) {
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var ctx = c.getContext('2d');
    drawFn(ctx, size);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.generateMipmap(gl.TEXTURE_2D);
    var wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  function createSolidTex(gl) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    return tex;
  }

  function Renderer(canvas) {
    this.canvas = canvas;
    var gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) {
      alert('WebGL is required for this 3D simulation.');
      return;
    }
    this.gl = gl;
    this.prog = createProgram(gl, VS_SOURCE, FS_SOURCE);

    this.loc = {
      aPos: gl.getAttribLocation(this.prog, 'aPos'),
      aNormal: gl.getAttribLocation(this.prog, 'aNormal'),
      aUV: gl.getAttribLocation(this.prog, 'aUV'),
      uModel: gl.getUniformLocation(this.prog, 'uModel'),
      uViewProj: gl.getUniformLocation(this.prog, 'uViewProj'),
      uUVScale: gl.getUniformLocation(this.prog, 'uUVScale'),
      uTex: gl.getUniformLocation(this.prog, 'uTex'),
      uColor: gl.getUniformLocation(this.prog, 'uColor'),
      uEmissive: gl.getUniformLocation(this.prog, 'uEmissive'),
      uShininess: gl.getUniformLocation(this.prog, 'uShininess'),
      uIndoorGlow: gl.getUniformLocation(this.prog, 'uIndoorGlow'),
      uSunDir: gl.getUniformLocation(this.prog, 'uSunDir'),
      uSunColor: gl.getUniformLocation(this.prog, 'uSunColor'),
      uSkyColor: gl.getUniformLocation(this.prog, 'uSkyColor'),
      uGroundColor: gl.getUniformLocation(this.prog, 'uGroundColor'),
      uFogColor: gl.getUniformLocation(this.prog, 'uFogColor'),
      uFogDensity: gl.getUniformLocation(this.prog, 'uFogDensity'),
      uCamPos: gl.getUniformLocation(this.prog, 'uCamPos')
    };

    this.meshes = {
      box: uploadMesh(gl, buildBoxGeo()),
      cylinder: uploadMesh(gl, buildCylinderGeo(16)),
      sphere: uploadMesh(gl, buildSphereGeo(10, 14))
    };

    this.textures = {
      solid: createSolidTex(gl),
      carpet: createCanvasTex(gl, 128, function (ctx, s) {
        ctx.fillStyle = '#dcdde1';
        ctx.fillRect(0, 0, s, s);
        for (var i = 0; i < 600; i++) {
          ctx.fillStyle = (i % 2 === 0) ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
          ctx.fillRect((i * 19) % s, (i * 37) % s, 2, 2);
        }
      }, true),
      marble: createCanvasTex(gl, 128, function (ctx, s) {
        ctx.fillStyle = '#eceff4';
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = 'rgba(148,163,184,0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, s / 2, s / 2);
        ctx.strokeRect(s / 2, s / 2, s / 2, s / 2);
        ctx.strokeRect(s / 2, 0, s / 2, s / 2);
        ctx.strokeRect(0, s / 2, s / 2, s / 2);
      }, true),
      wood: createCanvasTex(gl, 128, function (ctx, s) {
        ctx.fillStyle = '#c89b6e';
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = 'rgba(92,56,28,0.28)';
        ctx.lineWidth = 1.5;
        for (var y = 0; y < s; y += 16) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
        }
      }, true),
      grass: createCanvasTex(gl, 128, function (ctx, s) {
        ctx.fillStyle = '#5a9e4b';
        ctx.fillRect(0, 0, s, s);
        for (var i = 0; i < 500; i++) {
          ctx.fillStyle = (i % 3 === 0) ? 'rgba(255,255,255,0.06)' : 'rgba(20,60,15,0.09)';
          ctx.fillRect((i * 29) % s, (i * 53) % s, 3, 2);
        }
      }, true),
      asphalt: createCanvasTex(gl, 128, function (ctx, s) {
        ctx.fillStyle = '#333942';
        ctx.fillRect(0, 0, s, s);
        for (var i = 0; i < 700; i++) {
          ctx.fillStyle = (i % 2 === 0) ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.09)';
          ctx.fillRect((i * 17) % s, (i * 41) % s, 2, 2);
        }
      }, true),
      brick: createCanvasTex(gl, 128, function (ctx, s) {
        ctx.fillStyle = '#9aa5b1';
        ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = 'rgba(30,41,59,0.22)';
        for (var y = 8; y < s; y += 24) {
          for (var x = 8; x < s; x += 24) {
            ctx.fillRect(x, y, 12, 14);
          }
        }
      }, true),
      glassGrid: createCanvasTex(gl, 128, function (ctx, s) {
        ctx.fillStyle = 'rgba(186, 230, 253, 0.34)';
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.65)';
        ctx.lineWidth = 5;
        ctx.strokeRect(0, 0, s, s);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s);
        ctx.stroke();
      }, true)
    };

    this.boundMesh = null;
    this.matTmp = Mat4.create();
    this.transparentQueue = [];
  }

  Renderer.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.floor(this.canvas.clientWidth * dpr);
    var h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    return this.canvas.width / Math.max(1, this.canvas.height);
  };

  Renderer.prototype.beginFrame = function (env, viewProj, camPos) {
    var gl = this.gl;
    this.camPos = camPos;
    this.transparentQueue.length = 0;

    gl.clearColor(env.sky[0], env.sky[1], env.sky[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.uViewProj, false, viewProj);
    gl.uniform3fv(this.loc.uSunDir, env.sunDir);
    gl.uniform3fv(this.loc.uSunColor, env.sunColor);
    gl.uniform3fv(this.loc.uSkyColor, env.ambientSky);
    gl.uniform3fv(this.loc.uGroundColor, env.ambientGround);
    gl.uniform3fv(this.loc.uFogColor, env.fogColor);
    gl.uniform1f(this.loc.uFogDensity, env.fogDensity);
    gl.uniform3fv(this.loc.uCamPos, camPos);
    this.boundMesh = null;
  };

  Renderer.prototype.bindMesh = function (meshName) {
    if (this.boundMesh === meshName) return;
    var gl = this.gl;
    var m = this.meshes[meshName];
    gl.bindBuffer(gl.ARRAY_BUFFER, m.posBuf);
    gl.enableVertexAttribArray(this.loc.aPos);
    gl.vertexAttribPointer(this.loc.aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, m.normBuf);
    gl.enableVertexAttribArray(this.loc.aNormal);
    gl.vertexAttribPointer(this.loc.aNormal, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, m.uvBuf);
    gl.enableVertexAttribArray(this.loc.aUV);
    gl.vertexAttribPointer(this.loc.aUV, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idxBuf);
    this.boundMesh = meshName;
  };

  Renderer.prototype._drawImmediate = function (cmd) {
    var gl = this.gl;
    this.bindMesh(cmd.mesh);
    gl.uniformMatrix4fv(this.loc.uModel, false, cmd.model);
    gl.uniform2f(this.loc.uUVScale, cmd.uvX, cmd.uvY);
    gl.uniform4f(this.loc.uColor, cmd.r, cmd.g, cmd.b, cmd.a);
    gl.uniform3f(this.loc.uEmissive, cmd.er, cmd.eg, cmd.eb);
    gl.uniform1f(this.loc.uShininess, cmd.shininess);
    gl.uniform1f(this.loc.uIndoorGlow, cmd.indoorGlow);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[cmd.tex] || this.textures.solid);
    gl.uniform1i(this.loc.uTex, 0);

    gl.drawElements(gl.TRIANGLES, this.meshes[cmd.mesh].count, gl.UNSIGNED_SHORT, 0);
  };

  Renderer.prototype.submit = function (mesh, tx, ty, tz, rx, ry, sx, sy, sz, opts) {
    opts = opts || {};
    var a = opts.alpha !== undefined ? opts.alpha : 1.0;
    var model = new Float32Array(16);
    if (rx) {
      Mat4.fromTRSX(model, tx, ty, tz, rx, ry || 0, sx, sy, sz);
    } else {
      Mat4.fromTRS(model, tx, ty, tz, ry || 0, sx, sy, sz);
    }
    var c = opts.color || [1, 1, 1];
    var e = opts.emissive || [0, 0, 0];
    var cmd = {
      mesh: mesh,
      model: model,
      tx: tx, ty: ty, tz: tz,
      r: c[0], g: c[1], b: c[2], a: a,
      er: e[0], eg: e[1], eb: e[2],
      tex: opts.tex || 'solid',
      uvX: opts.uvX || 1,
      uvY: opts.uvY || 1,
      shininess: opts.shininess !== undefined ? opts.shininess : 12,
      indoorGlow: opts.indoorGlow || 0
    };

    if (a < 0.99 || opts.transparent) {
      var dx = tx - this.camPos[0], dy = ty - this.camPos[1], dz = tz - this.camPos[2];
      cmd.distSq = dx * dx + dy * dy + dz * dz;
      this.transparentQueue.push(cmd);
    } else {
      this._drawImmediate(cmd);
    }
  };

  Renderer.prototype.drawBox = function (tx, ty, tz, sx, sy, sz, opts) {
    this.submit('box', tx, ty, tz, 0, (opts && opts.ry) || 0, sx, sy, sz, opts);
  };

  Renderer.prototype.drawBoxRot = function (tx, ty, tz, rx, ry, sx, sy, sz, opts) {
    this.submit('box', tx, ty, tz, rx, ry, sx, sy, sz, opts);
  };

  Renderer.prototype.drawCyl = function (tx, ty, tz, rx, ry, sx, sy, sz, opts) {
    this.submit('cylinder', tx, ty, tz, rx, ry, sx, sy, sz, opts);
  };

  Renderer.prototype.drawSphere = function (tx, ty, tz, sx, sy, sz, opts) {
    this.submit('sphere', tx, ty, tz, 0, 0, sx, sy, sz, opts);
  };

  Renderer.prototype.endFrame = function () {
    var gl = this.gl;
    if (this.transparentQueue.length > 0) {
      this.transparentQueue.sort(function (a, b) { return b.distSq - a.distSq; });
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      for (var i = 0; i < this.transparentQueue.length; i++) {
        this._drawImmediate(this.transparentQueue[i]);
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
    }
  };

  OfficeSim.Renderer = Renderer;
})(window);
