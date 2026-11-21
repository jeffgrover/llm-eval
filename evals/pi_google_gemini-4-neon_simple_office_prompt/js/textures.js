(function () {
  'use strict';

  var OfficeSim = (window.OfficeSim = window.OfficeSim || {});

  function createCanvasTexture(width, height, drawFn, repeatX, repeatY) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d');
    drawFn(ctx, width, height);
    var tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    if (repeatX || repeatY) {
      tex.repeat.set(repeatX || 1, repeatY || 1);
    }
    tex.anisotropy = 4;
    return tex;
  }

  OfficeSim.Textures = {
    cache: {},

    init: function () {
      var c = this.cache;

      // 1. Lobby Terrazzo Marble
      c.terrazzo = createCanvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#e8e4dc';
        ctx.fillRect(0, 0, w, h);
        // Subtle stone tile grid
        ctx.strokeStyle = 'rgba(140, 132, 120, 0.25)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, w - 2, h - 2);
        ctx.beginPath();
        ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
        ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
        ctx.stroke();
        // Terrazzo speckles
        var colors = ['#c7bfb2', '#a89f91', '#d8d2c5', '#8c857b', '#f5f2eb'];
        for (var i = 0; i < 240; i++) {
          ctx.fillStyle = colors[i % colors.length];
          var x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
          var y = (Math.sin(i * 78.233) * 43758.5453) % 1;
          x = Math.abs(x) * w;
          y = Math.abs(y) * h;
          ctx.fillRect(x, y, 2 + (i % 4), 2 + ((i * 3) % 3));
        }
      }, 8, 6);

      // 2. Warm Oak Wood Planks (Cafe)
      c.wood = createCanvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#b48a60';
        ctx.fillRect(0, 0, w, h);
        var planks = 8;
        var ph = h / planks;
        for (var i = 0; i < planks; i++) {
          var shade = (i % 3 === 0) ? '#aa7f56' : (i % 3 === 1 ? '#be946a' : '#b2875d');
          ctx.fillStyle = shade;
          ctx.fillRect(0, i * ph, w, ph - 1);
          ctx.fillStyle = 'rgba(65, 40, 18, 0.14)';
          for (var g = 0; g < 6; g++) {
            ctx.fillRect(0, i * ph + g * 5, w, 1);
          }
          ctx.fillStyle = 'rgba(55, 35, 15, 0.32)';
          ctx.fillRect(0, (i + 1) * ph - 1, w, 1);
          var joint = ((i * 97) % w);
          ctx.fillRect(joint, i * ph, 1, ph);
        }
      }, 7, 5);

      // 3. Light Birch Wood (Design Studio)
      c.wood_light = createCanvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#d9c5a8';
        ctx.fillRect(0, 0, w, h);
        var planks = 8;
        var ph = h / planks;
        for (var i = 0; i < planks; i++) {
          ctx.fillStyle = (i % 2 === 0) ? '#dfd0b8' : '#d2bc9b';
          ctx.fillRect(0, i * ph, w, ph - 1);
          ctx.fillStyle = 'rgba(110, 88, 60, 0.18)';
          ctx.fillRect(0, (i + 1) * ph - 1, w, 1);
        }
      }, 7, 5);

      // 4. Slate Carpet Tiles (Engineering)
      c.carpet_slate = createCanvasTexture(128, 128, function (ctx, w, h) {
        ctx.fillStyle = '#475569';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#4f5e73';
        ctx.fillRect(0, 0, w / 2, h / 2);
        ctx.fillRect(w / 2, h / 2, w / 2, h / 2);
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.22)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, w / 2, h / 2);
        ctx.strokeRect(w / 2, h / 2, w / 2, h / 2);
        for (var i = 0; i < 300; i++) {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
          ctx.fillRect((i * 37) % w, (i * 73) % h, 2, 1);
        }
      }, 12, 8);

      // 5. Warm Taupe Carpet (Operations & Sales)
      c.carpet_warm = createCanvasTexture(128, 128, function (ctx, w, h) {
        ctx.fillStyle = '#6b6560';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#756f69';
        ctx.fillRect(0, 0, w / 2, h / 2);
        ctx.fillRect(w / 2, h / 2, w / 2, h / 2);
        ctx.strokeStyle = 'rgba(30, 25, 20, 0.2)';
        ctx.strokeRect(0, 0, w / 2, h / 2);
        ctx.strokeRect(w / 2, h / 2, w / 2, h / 2);
      }, 12, 8);

      // 6. Deep Navy Executive Carpet
      c.carpet_navy = createCanvasTexture(128, 128, function (ctx, w, h) {
        ctx.fillStyle = '#243045';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#2a3850';
        ctx.fillRect(0, 0, w / 2, h / 2);
        ctx.fillRect(w / 2, h / 2, w / 2, h / 2);
        ctx.strokeStyle = 'rgba(10, 15, 25, 0.28)';
        ctx.strokeRect(0, 0, w / 2, h / 2);
        ctx.strokeRect(w / 2, h / 2, w / 2, h / 2);
      }, 10, 7);

      // 7. Rooftop Cedar Deck
      c.deck = createCanvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#8b6343';
        ctx.fillRect(0, 0, w, h);
        var slats = 12;
        var sh = h / slats;
        for (var i = 0; i < slats; i++) {
          ctx.fillStyle = i % 2 === 0 ? '#936a48' : '#825c3e';
          ctx.fillRect(0, i * sh, w, sh - 2);
          ctx.fillStyle = '#4e3522';
          ctx.fillRect(0, (i + 1) * sh - 2, w, 2);
        }
      }, 8, 6);

      // 8. Granite Plaza Pavers
      c.plaza = createCanvasTexture(256, 256, function (ctx, w, h) {
        ctx.fillStyle = '#b9bcc2';
        ctx.fillRect(0, 0, w, h);
        var cols = 4, rows = 4;
        var cw = w / cols, ch = h / rows;
        for (var r = 0; r < rows; r++) {
          for (var col = 0; col < cols; col++) {
            var v = 178 + ((r * 7 + col * 13) % 18);
            ctx.fillStyle = 'rgb(' + v + ',' + (v + 2) + ',' + (v + 5) + ')';
            ctx.fillRect(col * cw + 1, r * ch + 1, cw - 2, ch - 2);
          }
        }
      }, 14, 14);

      // 9. Asphalt Road
      c.road = createCanvasTexture(512, 256, function (ctx, w, h) {
        ctx.fillStyle = '#2d323a';
        ctx.fillRect(0, 0, w, h);
        // Subtle asphalt grain
        for (var i = 0; i < 1200; i++) {
          ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.07)';
          ctx.fillRect((i * 53) % w, (i * 97) % h, 2, 2);
        }
        // Dashed yellow center line
        ctx.fillStyle = '#eab308';
        for (var x = 16; x < w; x += 64) {
          ctx.fillRect(x, h / 2 - 4, 34, 8);
        }
        // Crisp white edge lines
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(0, 12, w, 5);
        ctx.fillRect(0, h - 17, w, 5);
      }, 6, 1);

      // 10. Computer Monitor Screen (Code & Dashboard)
      c.screenCode = createCanvasTexture(128, 80, function (ctx, w, h) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 22, h);
        var lineColors = ['#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#94a3b8'];
        for (var y = 8; y < h - 6; y += 6) {
          ctx.fillStyle = lineColors[(y / 6) % lineColors.length | 0];
          var indent = ((y * 7) % 18);
          var len = 24 + ((y * 19) % 68);
          ctx.fillRect(28 + indent, y, len, 3);
        }
      }, 1, 1);

      c.screenChart = createCanvasTexture(128, 80, function (ctx, w, h) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#0ea5e9';
        ctx.fillRect(0, 0, w, 12);
        // Mini bar chart
        var bars = [32, 46, 28, 54, 42, 60, 48];
        for (var i = 0; i < bars.length; i++) {
          ctx.fillStyle = i % 2 === 0 ? '#38bdf8' : '#6366f1';
          ctx.fillRect(10 + i * 16, h - 8 - bars[i] * 0.75, 10, bars[i] * 0.75);
        }
      }, 1, 1);

      // 11. Whiteboard with architecture diagram
      c.whiteboard = createCanvasTexture(256, 128, function (ctx, w, h) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, w - 4, h - 4);
        // Boxes & arrows
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(24, 24, 52, 30);
        ctx.strokeRect(104, 24, 52, 30);
        ctx.strokeRect(184, 24, 48, 30);
        ctx.strokeStyle = '#e11d48';
        ctx.strokeRect(64, 78, 60, 28);
        ctx.strokeStyle = '#16a34a';
        ctx.strokeRect(156, 78, 60, 28);
        // Connector lines
        ctx.strokeStyle = '#475569';
        ctx.beginPath();
        ctx.moveTo(76, 39); ctx.lineTo(104, 39);
        ctx.moveTo(156, 39); ctx.lineTo(184, 39);
        ctx.moveTo(130, 54); ctx.lineTo(94, 78);
        ctx.moveTo(130, 54); ctx.lineTo(186, 78);
        ctx.stroke();
      }, 1, 1);

      // 12. Neighboring City Building Facade
      c.cityFacade = createCanvasTexture(256, 512, function (ctx, w, h) {
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, 0, w, h);
        var cols = 6, rows = 16;
        var cw = w / cols, rh = h / rows;
        for (var r = 0; r < rows; r++) {
          for (var col = 0; col < cols; col++) {
            var lit = ((r * 17 + col * 31) % 5) === 0;
            ctx.fillStyle = lit ? '#e2e8f0' : '#475569';
            ctx.fillRect(col * cw + 5, r * rh + 6, cw - 10, rh - 10);
          }
        }
      }, 1, 1);

      return c;
    },

    get: function (name) {
      return this.cache[name] || null;
    }
  };
})();
