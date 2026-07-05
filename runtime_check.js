#!/usr/bin/env node
const fs = require("fs");
const http = require("http");
const path = require("path");
const { staticCheckEval } = require("./static_check");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (err) {
  console.error("Playwright is not available. Install it, or run with NODE_PATH pointing at a Playwright node_modules directory.");
  console.error(`Load error: ${err && err.message ? err.message : err}`);
  console.error("Example: npm install --save-dev playwright && node runtime_check.js --all");
  process.exit(1);
}

const ROOT = process.cwd();
const EVALS_DIR = path.join(ROOT, "evals");
const PREVIEW_FILES = ["index.html", "elevator_sim.html", "elevator_simulation.html", "test.html"];

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
  }[ext] || "application/octet-stream";
}

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    const requested = path.resolve(ROOT, `.${urlPath}`);
    if (!requested.startsWith(ROOT)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    fs.readFile(requested, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": contentType(requested) });
      res.end(data);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function previewFile(evalDir) {
  for (const name of PREVIEW_FILES) {
    const candidate = path.join(evalDir, name);
    if (fs.existsSync(candidate)) return name;
  }
  return null;
}

function printUsage() {
  console.log(`Usage: node runtime_check.js <eval-dir> | --all

Runs a headless-browser smoke check (static check + canvas/animation probe)
against one or more evaluation runs, writing runtime_check.json into each.

Arguments:
  <eval-dir>     Process a single evaluation run. Accepts a bare run name
                 (e.g. claude_sonnet-4_prompt1), a path relative to evals/,
                 or a path relative to the repo root.
  --all          Process every evaluation run under evals/.
  -h, --help     Show this help message.

Examples:
  node runtime_check.js claude_sonnet-4_prompt1
  node runtime_check.js evals/claude_sonnet-4_prompt1
  node runtime_check.js --all`);
}

function resolveEvalDir(arg) {
  const candidates = [
    path.resolve(ROOT, arg),
    path.join(EVALS_DIR, arg),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }
  return null;
}

function evalTargets(arg) {
  if (arg === "--all") {
    if (!fs.existsSync(EVALS_DIR)) return [];
    return fs.readdirSync(EVALS_DIR)
      .map((name) => path.join(EVALS_DIR, name))
      .filter((item) => fs.statSync(item).isDirectory() && previewFile(item));
  }
  const evalDir = resolveEvalDir(arg);
  if (!evalDir) {
    console.error(`No evaluation directory found for "${arg}".`);
    console.error(`Looked for: ${path.resolve(ROOT, arg)}`);
    console.error(`        and: ${path.join(EVALS_DIR, arg)}`);
    return [];
  }
  if (!previewFile(evalDir)) {
    console.error(`"${path.relative(ROOT, evalDir)}" has no preview file (${PREVIEW_FILES.join(", ")}).`);
    return [];
  }
  return [evalDir];
}

async function canvasSnapshot(page) {
  return await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll("canvas"));
    const canvas = canvases[0];
    if (!canvas) {
      return { canvas_count: 0, nonblank_canvas: false, complexity: 0, checksum: "", error: "" };
    }
    try {
      const dataUrl = canvas.toDataURL("image/png");
      let checksum = 0;
      const buckets = new Set();
      for (let i = 0; i < dataUrl.length; i += 97) {
        const code = dataUrl.charCodeAt(i);
        checksum = (checksum + code * (i + 1)) % 1000000007;
        buckets.add(code >> 3);
      }
      return {
        canvas_count: canvases.length,
        nonblank_canvas: dataUrl.length > 3000 && buckets.size > 2,
        complexity: buckets.size,
        checksum: String(checksum),
        error: "",
      };
    } catch (err) {
      return { canvas_count: canvases.length, nonblank_canvas: false, complexity: 0, checksum: "", error: String(err && err.message || err) };
    }
  });
}

async function boostSimulationControls(page) {
  await page.evaluate(() => {
    for (const input of Array.from(document.querySelectorAll("input[type='range']"))) {
      if (input.max) {
        input.value = input.max;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }).catch(() => {});
}

async function probeEval(browser, serverPort, evalDir) {
  const staticCheck = staticCheckEval(evalDir);
  const preview = previewFile(evalDir);
  const rel = path.relative(ROOT, path.join(evalDir, preview)).replace(/\\/g, "/");
  const url = `http://127.0.0.1:${serverPort}/${rel}`;
  const consoleErrors = [];
  const pageErrors = [];
  const warnings = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.addInitScript(() => {
    window.__llmEvalRuntime = {
      frames: 0,
      objectCount: 0,
      objectChanges: 0,
      threePatched: false,
    };
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = function patchedRequestAnimationFrame(callback) {
      return originalRequestAnimationFrame.call(window, function countedFrame(ts) {
        window.__llmEvalRuntime.frames += 1;
        return callback(ts);
      });
    };
    const patchTimer = window.setInterval(() => {
      const THREE = window.THREE;
      if (!THREE || !THREE.Object3D || window.__llmEvalRuntime.threePatched) return;
      window.__llmEvalRuntime.threePatched = true;
      const seen = new WeakSet();
      const lastPositions = new WeakMap();
      const originalUpdateMatrixWorld = THREE.Object3D.prototype.updateMatrixWorld;
      THREE.Object3D.prototype.updateMatrixWorld = function patchedUpdateMatrixWorld(...args) {
        try {
          if (!seen.has(this)) {
            seen.add(this);
            window.__llmEvalRuntime.objectCount += 1;
          }
          if (this.position) {
            const pos = `${this.position.x.toFixed(3)},${this.position.y.toFixed(3)},${this.position.z.toFixed(3)}`;
            const last = lastPositions.get(this);
            if (last && last !== pos) {
              window.__llmEvalRuntime.objectChanges += 1;
            }
            lastPositions.set(this, pos);
          }
        } catch (err) {
          // Instrumentation should never break the evaluated artifact.
        }
        return originalUpdateMatrixWorld.apply(this, args);
      };
      window.clearInterval(patchTimer);
    }, 10);
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  const started = Date.now();
  let loaded = false;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    loaded = true;
    await page.waitForTimeout(1200);
    await boostSimulationControls(page);
    await page.waitForTimeout(300);
  } catch (err) {
    pageErrors.push(String(err && err.message || err));
  }

  const first = await canvasSnapshot(page);
  await page.waitForTimeout(4200);
  const second = await canvasSnapshot(page);
  const runtimeStats = await page.evaluate(() => window.__llmEvalRuntime || {}).catch(() => ({}));
  const frames = Number(runtimeStats.frames || 0);
  const objectCount = Number(runtimeStats.objectCount || 0);
  const objectChanges = Number(runtimeStats.objectChanges || 0);

  if (first.error || second.error) warnings.push(`Canvas sampling issue: ${first.error || second.error}`);

  await page.close();
  return {
    checked_at: new Date().toISOString(),
    url,
    static_errors: staticCheck.static_errors,
    static_warnings: staticCheck.static_warnings,
    static_files_checked: staticCheck.files_checked,
    loaded,
    console_errors: consoleErrors.slice(0, 10),
    page_errors: pageErrors.slice(0, 10),
    canvas_count: Math.max(first.canvas_count || 0, second.canvas_count || 0),
    nonblank_canvas: Boolean(first.nonblank_canvas || second.nonblank_canvas),
    animation_frames: frames,
    scene_object_count: objectCount,
    dynamic_changes: objectChanges,
    canvas_changed: Boolean(first.checksum && second.checksum && first.checksum !== second.checksum),
    duration_ms: Date.now() - started,
    warnings,
  };
}

async function main() {
  const arg = process.argv[2];
  if (!arg || arg === "-h" || arg === "--help") {
    printUsage();
    process.exit(arg ? 0 : 1);
  }
  const targets = evalTargets(arg);
  if (!targets.length) {
    console.error("No evaluation directories with previews found.");
    process.exit(1);
  }
  const server = await startServer();
  const port = server.address().port;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const evalDir of targets) {
      const result = await probeEval(browser, port, evalDir);
      const outPath = path.join(evalDir, "runtime_check.json");
      fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
      let status = "ok";
      if (result.static_errors.length || result.console_errors.length || result.page_errors.length || !result.loaded) {
        status = "errors";
      } else if (!result.canvas_count || !result.nonblank_canvas) {
        status = "no-canvas";
      } else if (result.animation_frames < 2) {
        status = "no-animation";
      } else if (result.dynamic_changes <= 0) {
        status = "no-motion";
      }
      console.log(`${path.relative(ROOT, evalDir)}: ${status}, R probe written`);
      console.log(
        `  metrics: loaded=${result.loaded} canvas=${result.canvas_count} nonblank=${result.nonblank_canvas} frames=${result.animation_frames} objects=${result.scene_object_count} changes=${result.dynamic_changes}`
      );
      const details = [
        ...result.static_errors.map((err) => `static: ${err}`),
        ...result.page_errors.map((err) => `page: ${err}`),
        ...result.console_errors.map((err) => `console: ${err}`),
        ...result.warnings.map((err) => `warning: ${err}`),
      ];
      for (const detail of details.slice(0, 5)) {
        console.log(`  - ${detail}`);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
