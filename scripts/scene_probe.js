// One-off: inspect live THREE scene state in the patched office sim.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const ROOT = process.cwd();

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" }[ext] || "application/octet-stream";
}

async function main() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const requested = path.resolve(ROOT, `.${urlPath}`);
    fs.readFile(requested, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": contentType(requested) });
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.addInitScript(() => {
    const patchTimer = window.setInterval(() => {
      const THREE = window.THREE;
      if (!THREE || window.__patched) return;
      window.__patched = true;
      window.clearInterval(patchTimer);
      const orig = THREE.WebGLRenderer.prototype.render;
      window.__renderCount = 0;
      THREE.WebGLRenderer.prototype.render = function (...args) {
        window.__renderCount += 1;
        return orig.apply(this, args);
      };
    }, 5);
  });

  await page.goto(`http://127.0.0.1:${port}/evals/tmp_fixtest_office/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const slider = document.querySelector("input[type='range']");
    if (slider) { slider.value = slider.max; slider.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  await page.waitForTimeout(8000);

  const report = await page.evaluate(() => {
    const out = { renderCalls: window.__renderCount || 0 };
    try {
      const canvases = document.querySelectorAll("canvas");
      out.canvasCount = canvases.length;
      // Find THREE scene via any renderer? Walk the global scope is not exposed;
      // instead inspect via scene reference leaked through elevator/person globals.
      out.globals = Object.keys(window).filter((k) => /scene|agent|elev|clock|sim/i.test(k)).slice(0, 20);
      // count animated elements: check if person.js exposes anything
      out.personGlobal = typeof window.createPerson;
      out.time = (document.getElementById("time-display") || {}).textContent || null;
      // sample canvas pixel variance
      const c = canvases[0];
      if (c) {
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        out.hasGLContext = Boolean(gl);
      }
    } catch (e) {
      out.err = String(e);
    }
    return out;
  });
  console.log("errors:", errors.length ? errors : "none");
  console.log(JSON.stringify(report, null, 1));
  server.close();
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
