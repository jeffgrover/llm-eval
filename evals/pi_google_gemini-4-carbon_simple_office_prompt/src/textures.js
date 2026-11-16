import * as THREE from 'three';

function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function createTextures() {
  return {
    lobbyMarble: makeLobbyMarble(),
    carpetBlueGrey: makeCarpetTile('#2b3340', '#252c38', '#333d4d'),
    carpetWarmGrey: makeCarpetTile('#353338', '#2e2c31', '#3e3b42'),
    carpetExec: makeCarpetTile('#292634', '#23202d', '#343042'),
    woodDeck: makeWoodPlanks('#8d5b3c', '#75492e', '#a16b49'),
    woodOak: makeWoodPlanks('#b9895a', '#a37548', '#c8996a'),
    plazaStone: makePlazaStone(),
    roadAsphalt: makeAsphalt(),
    screenCode: makeMonitorScreen('code'),
    screenDesign: makeMonitorScreen('design'),
    screenMetrics: makeMonitorScreen('metrics'),
    presentationSlide: makePresentationTexture(),
    whiteboard: makeWhiteboardTexture(),
    cityFacadeDay: makeCityFacade(false),
    cityFacadeNight: makeCityFacade(true)
  };
}

function makeLobbyMarble() {
  const c = createCanvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e7e2d8';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle travertine veins
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(195,184,168,0.28)' : 'rgba(255,252,246,0.35)';
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath();
    let y = (i * 9.3) % 512;
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 64) {
      y += Math.sin(x * 0.02 + i) * 6;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Large architectural stone tile joints
  ctx.strokeStyle = 'rgba(150,142,130,0.45)';
  ctx.lineWidth = 2;
  const step = 128;
  for (let p = 0; p <= 512; p += step) {
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(512, p); ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 5);
  return tex;
}

function makeCarpetTile(c1, c2, accent) {
  const c = createCanvas(256, 256);
  const ctx = c.getContext('2d');
  const half = 128;
  const colors = [c1, c2, c2, c1];
  for (let idx = 0; idx < 4; idx++) {
    const x = (idx % 2) * half;
    const y = Math.floor(idx / 2) * half;
    ctx.fillStyle = colors[idx];
    ctx.fillRect(x, y, half, half);

    // Fine woven linear texture alternating direction
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1;
    for (let k = 4; k < half; k += 6) {
      ctx.beginPath();
      if (idx === 0 || idx === 3) {
        ctx.moveTo(x + k, y);
        ctx.lineTo(x + k, y + half);
      } else {
        ctx.moveTo(x, y + k);
        ctx.lineTo(x + half, y + k);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 9);
  return tex;
}

function makeWoodPlanks(base, dark, light) {
  const c = createCanvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);

  const plankH = 32;
  for (let row = 0; row < 16; row++) {
    const y = row * plankH;
    ctx.fillStyle = row % 3 === 0 ? light : (row % 2 === 0 ? base : dark);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, y, 512, plankH - 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(40,22,10,0.45)';
    ctx.fillRect(0, y + plankH - 2, 512, 2);

    const jointX = ((row * 137) % 380) + 60;
    ctx.fillRect(jointX, y, 2, plankH);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

function makePlazaStone() {
  const c = createCanvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#cfc9be';
  ctx.fillRect(0, 0, 512, 512);

  const w = 128, h = 64;
  for (let row = 0; row < 8; row++) {
    const offset = (row % 2) * 64;
    for (let col = -1; col < 5; col++) {
      const x = col * w + offset;
      const y = row * h;
      const shade = 200 + ((row * 7 + col * 13) % 18);
      ctx.fillStyle = `rgb(${shade}, ${shade - 4}, ${shade - 11})`;
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 8);
  return tex;
}

function makeAsphalt() {
  const c = createCanvas(512, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#26292e';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle aggregate speckle
  for (let i = 0; i < 2500; i++) {
    const x = (i * 73) % 512;
    const y = (i * 197) % 512;
    const v = 32 + (i % 24);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Center dashed yellow/warm-white divider
  ctx.fillStyle = '#eab308';
  for (let x = 16; x < 512; x += 96) {
    ctx.fillRect(x, 250, 52, 6);
    ctx.fillRect(x, 260, 52, 6);
  }

  // Edge white lines
  ctx.fillStyle = 'rgba(241,245,249,0.7)';
  ctx.fillRect(0, 22, 512, 5);
  ctx.fillRect(0, 485, 512, 5);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 1);
  return tex;
}

function makeMonitorScreen(kind) {
  const c = createCanvas(256, 160);
  const ctx = c.getContext('2d');

  if (kind === 'code') {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 42, 160);
    const colors = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#94a3b8'];
    for (let line = 0; line < 14; line++) {
      const indent = ((line * 3) % 4) * 10;
      const len = 45 + ((line * 29) % 120);
      ctx.fillStyle = colors[line % colors.length];
      ctx.fillRect(52 + indent, 12 + line * 10, len, 5);
    }
  } else if (kind === 'design') {
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, 256, 160);
    ctx.fillStyle = '#27272a';
    ctx.fillRect(8, 12, 240, 136);
    // Artboards
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(38, 24, 78, 112);
    ctx.fillRect(132, 24, 86, 112);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(46, 32, 62, 28);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(140, 32, 70, 36);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(46, 68, 54, 8);
    ctx.fillRect(140, 76, 60, 8);
  } else {
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 256, 160);
    // Charts & KPI cards
    const cols = ['#22d3ee', '#818cf8', '#34d399', '#f59e0b'];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(12 + i * 59, 12, 53, 36);
      ctx.fillStyle = cols[i];
      ctx.fillRect(18 + i * 59, 32, 34, 8);
    }
    // Bar graph
    for (let b = 0; b < 12; b++) {
      const bh = 22 + ((b * 19) % 68);
      ctx.fillStyle = b % 2 === 0 ? '#38bdf8' : '#6366f1';
      ctx.fillRect(18 + b * 19, 142 - bh, 12, bh);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePresentationTexture() {
  const c = createCanvas(512, 288);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 512, 288);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(1, '#1e1b4b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 288);

  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(36, 30, 180, 14);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(36, 54, 280, 8);

  // Architecture nodes + connectors
  const nodes = [
    { x: 60, y: 110, c: '#0284c7' },
    { x: 210, y: 90, c: '#6366f1' },
    { x: 210, y: 175, c: '#10b981' },
    { x: 370, y: 130, c: '#f59e0b' }
  ];
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(130, 132); ctx.lineTo(210, 112);
  ctx.moveTo(130, 132); ctx.lineTo(210, 195);
  ctx.moveTo(290, 112); ctx.lineTo(370, 152);
  ctx.moveTo(290, 195); ctx.lineTo(370, 152);
  ctx.stroke();

  for (const n of nodes) {
    ctx.fillStyle = n.c;
    ctx.fillRect(n.x, n.y, 88, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(n.x + 12, n.y + 18, 64, 8);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeWhiteboardTexture() {
  const c = createCanvas(512, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 512, 256);

  // Sticky notes
  const stickyCols = ['#fde047', '#fda4af', '#7dd3fc', '#86efac', '#c4b5fd'];
  for (let i = 0; i < 14; i++) {
    const x = 28 + (i % 5) * 44;
    const y = 36 + Math.floor(i / 5) * 52;
    ctx.fillStyle = stickyCols[i % stickyCols.length];
    ctx.fillRect(x, y, 34, 34);
  }

  // Wireframe sketch on right half
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 3;
  ctx.strokeRect(270, 36, 200, 165);
  ctx.beginPath();
  ctx.moveTo(290, 165);
  ctx.quadraticCurveTo(350, 70, 445, 95);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCityFacade(emissivePass) {
  const c = createCanvas(256, 512);
  const ctx = c.getContext('2d');
  ctx.fillStyle = emissivePass ? '#000000' : '#334155';
  ctx.fillRect(0, 0, 256, 512);

  for (let row = 0; row < 24; row++) {
    for (let col = 0; col < 8; col++) {
      const lit = ((row * 17 + col * 11) % 7) < 3;
      if (emissivePass) {
        if (!lit) continue;
        ctx.fillStyle = (row + col) % 3 === 0 ? '#fde68a' : '#bae6fd';
      } else {
        ctx.fillStyle = lit ? '#64748b' : '#1e293b';
      }
      ctx.fillRect(10 + col * 30, 10 + row * 21, 20, 13);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createActivityBadgeTexture(emoji, label, bgHex = '#0f172a') {
  const c = createCanvas(256, 72);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 72);

  // Pill background
  ctx.fillStyle = bgHex;
  ctx.globalAlpha = 0.86;
  const r = 28;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(8, 8, 240, 56, r);
  } else {
    ctx.rect(8, 8, 240, 56);
  }
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(148,163,184,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = '26px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(emoji, 24, 37);

  ctx.font = '600 18px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#f1f5f9';
  ctx.fillText(label.slice(0, 16), 64, 37);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
