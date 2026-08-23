// One-off: deeper motion probe for the patched office sim copy.
const path = require("path");
const { chromium } = require("playwright");

const ROOT = process.cwd();
const http = require("http");
const fs = require("fs");

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
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(`http://127.0.0.1:${port}/evals/tmp_fixtest_office/index.html`, { waitUntil: "domcontentloaded" });
  const shot = () => page.evaluate(() => {
    const c = document.querySelector("canvas");
    return c ? c.toDataURL("image/png").length : 0;
  });
  await page.waitForTimeout(2000);
  const s1 = await shot();
  const state1 = await page.evaluate(() => {
    const t = document.getElementById("time-display");
    return { time: t ? t.textContent : null };
  }).catch(() => ({}));
  // Probe agent visibility/motion at current time, then fast-forward to work hours
  const before = await page.evaluate(() => {
    const canvases = document.querySelectorAll("canvas").length;
    return { canvases };
  });
  await page.evaluate(() => {
    // max the speed slider (up to 600x)
    const slider = document.querySelector("input[type='range']");
    if (slider) { slider.value = slider.max; slider.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  await page.waitForTimeout(10000);
  const s2 = await shot();
  const state2 = await page.evaluate(() => {
    const t = document.getElementById("time-display");
    return { time: t ? t.textContent : null };
  }).catch(() => ({}));
  console.log("page/console errors:", errors.length ? errors : "none");
  console.log("time at +2s:", state1.time, " time at +13s (after 600x boost):", state2.time);
  console.log("canvas png bytes +2s:", s1, " +13s:", s2, " changed:", s1 !== s2, "canvases:", before.canvases);
  server.close();
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
