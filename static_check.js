#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = process.cwd();
const EVALS_DIR = path.join(ROOT, "evals");

const KEYWORDS = new Set([
  "await", "async", "break", "case", "catch", "class", "const", "continue",
  "debugger", "default", "delete", "do", "else", "export", "extends",
  "false", "finally", "for", "from", "function", "if", "import", "in", "instanceof",
  "let", "new", "null", "of", "return", "static", "super", "switch", "this",
  "throw", "try", "typeof", "var", "void", "while", "with", "yield",
  "true",
]);

const KNOWN_GLOBALS = new Set([
  "Array", "ArrayBuffer", "BigInt", "Boolean", "DataView", "Date", "Error",
  "EvalError", "Event", "Float32Array", "Float64Array", "Infinity", "Intl",
  "JSON", "Map", "Math", "NaN", "Number", "Object", "Promise", "Proxy",
  "RangeError", "ReferenceError", "Reflect", "RegExp", "Set", "String",
  "Symbol", "SyntaxError", "THREE", "TypeError", "URIError", "URL",
  "WeakMap", "WeakSet", "alert", "cancelAnimationFrame", "clearInterval",
  "clearTimeout", "console", "decodeURIComponent", "document",
  "encodeURIComponent", "fetch", "globalThis", "isFinite", "isNaN",
  "localStorage", "module", "parseFloat", "parseInt", "performance",
  "requestAnimationFrame", "setInterval", "setTimeout", "undefined", "window",
]);

function isIdent(value) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function stripStringsAndComments(source) {
  let out = "";
  for (let i = 0; i < source.length;) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      out += "  ";
      i += 2;
      while (i < source.length && source[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        out += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      if (i < source.length) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      const quote = ch;
      out += " ";
      i += 1;
      while (i < source.length) {
        if (source[i] === "\\") {
          out += " ";
          i += 1;
          if (i < source.length) {
            out += source[i] === "\n" ? "\n" : " ";
            i += 1;
          }
          continue;
        }
        if (source[i] === quote) {
          out += " ";
          i += 1;
          break;
        }
        out += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function tokenize(source) {
  const stripped = stripStringsAndComments(source);
  const tokens = [];
  const re = /0x[0-9A-Fa-f]+|\d+(?:\.\d+)?|[A-Za-z_$][A-Za-z0-9_$]*|=>|===|!==|==|!=|<=|>=|\+\+|--|&&|\|\||[{}()[\].,;:=+\-*/%<>!?]/g;
  const lineStarts = [0];
  for (let i = 0; i < stripped.length; i += 1) {
    if (stripped[i] === "\n") lineStarts.push(i + 1);
  }
  function position(index) {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (lineStarts[mid] <= index) lo = mid + 1;
      else hi = mid - 1;
    }
    const lineIndex = Math.max(0, hi);
    return { line: lineIndex + 1, column: index - lineStarts[lineIndex] + 1 };
  }
  let match;
  while ((match = re.exec(stripped))) {
    tokens.push({ value: match[0], index: match.index, ...position(match.index) });
  }
  return tokens;
}

function makeScope(parent, kind, file) {
  return { parent, kind, file, declarations: new Set(), refs: [], children: [] };
}

function declare(scope, name) {
  if (name && isIdent(name) && !KEYWORDS.has(name)) scope.declarations.add(name);
}

function nearestFunctionScope(scope) {
  let current = scope;
  while (current && current.kind !== "function" && current.kind !== "root") {
    current = current.parent;
  }
  return current || scope;
}

function parseParamNames(tokens, startIndex) {
  const params = [];
  const paramIndices = [];
  let depth = 0;
  for (let i = startIndex; i < tokens.length; i += 1) {
    const value = tokens[i].value;
    if (value === "(") {
      depth += 1;
      continue;
    }
    if (value === ")") {
      depth -= 1;
      if (depth === 0) return { params, paramIndices, end: i };
      continue;
    }
    if (depth === 1 && isIdent(value) && !KEYWORDS.has(value)) {
      params.push(value);
      paramIndices.push(i);
    }
  }
  return { params, paramIndices, end: startIndex };
}

function arrowParamsBefore(tokens, arrowIndex) {
  const prev = tokens[arrowIndex - 1];
  if (!prev) return [];
  if (isIdent(prev.value) && !KEYWORDS.has(prev.value)) return [{ name: prev.value, tokenIndex: arrowIndex - 1 }];
  if (prev.value !== ")") return [];
  let depth = 0;
  for (let i = arrowIndex - 1; i >= 0; i -= 1) {
    const value = tokens[i].value;
    if (value === ")") depth += 1;
    else if (value === "(") {
      depth -= 1;
      if (depth === 0) {
        const params = [];
        for (let j = i + 1; j < arrowIndex - 1; j += 1) {
          if (isIdent(tokens[j].value) && !KEYWORDS.has(tokens[j].value)) params.push({ name: tokens[j].value, tokenIndex: j });
        }
        return params;
      }
    }
  }
  return [];
}

function collectDeclarationsAndRefs(filePath, globalScope, projectGlobals, rootDeclarations) {
  const source = fs.readFileSync(filePath, "utf8");
  const tokens = tokenize(source);
  const fileRoot = makeScope(globalScope, "root", filePath);
  globalScope.children.push(fileRoot);
  let scope = fileRoot;
  const scopeStack = [fileRoot];
  let pendingFunctionParams = null;
  let pendingFunctionParamEndIndex = -1;
  let pendingClassBody = false;
  let declarationMode = null;
  let declarationDepth = 0;
  let declarationExpectName = false;
  let skipRefs = new Set();

  function pushScope(kind, params) {
    const child = makeScope(scope, kind, filePath);
    scope.children.push(child);
    scopeStack.push(child);
    scope = child;
    for (const param of params || []) declare(scope, param);
  }

  function popScope() {
    if (scopeStack.length > 1) {
      scopeStack.pop();
      scope = scopeStack[scopeStack.length - 1];
    }
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const value = token.value;
    const prev = tokens[i - 1] && tokens[i - 1].value;
    const next = tokens[i + 1] && tokens[i + 1].value;

    if (value === "{") {
      if (pendingClassBody) {
        pushScope("class", []);
        pendingClassBody = false;
      } else if (pendingFunctionParams && i > pendingFunctionParamEndIndex) {
        pushScope("function", pendingFunctionParams);
        pendingFunctionParams = null;
        pendingFunctionParamEndIndex = -1;
      } else {
        pushScope("block", []);
      }
      declarationMode = null;
      continue;
    }
    if (value === "}") {
      popScope();
      declarationMode = null;
      continue;
    }

    if (value === "function") {
      const nameTok = tokens[i + 1];
      if (nameTok && isIdent(nameTok.value)) {
        declare(scope, nameTok.value);
        if (scope.kind === "root") projectGlobals.add(nameTok.value);
        skipRefs.add(i + 1);
      }
      const parenIndex = tokens.findIndex((tok, idx) => idx > i && tok.value === "(");
      if (parenIndex !== -1) {
        const parsed = parseParamNames(tokens, parenIndex);
        pendingFunctionParams = parsed.params;
        pendingFunctionParamEndIndex = parsed.end;
        for (const idx of parsed.paramIndices) skipRefs.add(idx);
      }
      continue;
    }

    if (value === "catch" && next === "(") {
      const nameTok = tokens[i + 2];
      if (nameTok && isIdent(nameTok.value)) {
        pendingFunctionParams = [nameTok.value];
        pendingFunctionParamEndIndex = i + 3;
        skipRefs.add(i + 2);
      }
      continue;
    }

    if (next === "=>") {
      skipRefs.add(i);
      continue;
    }

    if (value === "=>") {
      const params = arrowParamsBefore(tokens, i);
      const paramNames = params.map((param) => param.name);
      const paramIndexes = new Set(params.map((param) => tokens[param.tokenIndex].index));
      for (const param of params) skipRefs.add(param.tokenIndex);
      scope.refs = scope.refs.filter((ref) => !paramIndexes.has(ref.index));
      if (next === "{") {
        pendingFunctionParams = paramNames;
        pendingFunctionParamEndIndex = i;
      } else {
        for (const param of paramNames) declare(scope, param);
      }
      continue;
    }

    if ((value === "var" || value === "let" || value === "const")) {
      declarationMode = value;
      declarationDepth = 0;
      declarationExpectName = true;
      continue;
    }

    if (declarationMode) {
      if (value === "(" || value === "[" || value === "{") declarationDepth += 1;
      if (value === ")" || value === "]" || value === "}") declarationDepth -= 1;
      if ((value === ";" || value === "for") && declarationDepth <= 0) {
        declarationMode = null;
        declarationExpectName = false;
        continue;
      }
      if (value === "," && declarationDepth === 0) {
        declarationExpectName = true;
        continue;
      }
      if (value === "=" && declarationDepth === 0) {
        declarationExpectName = false;
        continue;
      }
      if (declarationExpectName && isIdent(value) && !KEYWORDS.has(value) && declarationDepth === 0 && prev !== "." && next !== ":") {
        const targetScope = declarationMode === "var" ? nearestFunctionScope(scope) : scope;
        declare(targetScope, value);
        if (targetScope.kind === "root") {
          projectGlobals.add(value);
          if (declarationMode === "let" || declarationMode === "const") {
            if (!rootDeclarations.has(value)) rootDeclarations.set(value, []);
            rootDeclarations.get(value).push({ kind: declarationMode, file: filePath, line: token.line, column: token.column });
          }
        }
        skipRefs.add(i);
        declarationExpectName = false;
        continue;
      }
      continue;
    }

    if (value === "class" && next && isIdent(next)) {
      declare(scope, next);
      if (scope.kind === "root") {
        projectGlobals.add(next);
        if (!rootDeclarations.has(next)) rootDeclarations.set(next, []);
        rootDeclarations.get(next).push({ kind: "class", file: filePath, line: token.line, column: token.column });
      }
      skipRefs.add(i + 1);
      pendingClassBody = true;
      continue;
    }

    if (scope.kind === "class" && isIdent(value) && next === "(") {
      const parsed = parseParamNames(tokens, i + 1);
      pendingFunctionParams = parsed.params;
      pendingFunctionParamEndIndex = parsed.end;
      skipRefs.add(i);
      for (const idx of parsed.paramIndices) skipRefs.add(idx);
      continue;
    }

    if (scope.kind === "class" && (value === "get" || value === "set") && tokens[i + 2] && tokens[i + 2].value === "(") {
      const parsed = parseParamNames(tokens, i + 2);
      pendingFunctionParams = parsed.params;
      pendingFunctionParamEndIndex = parsed.end;
      skipRefs.add(i);
      skipRefs.add(i + 1);
      for (const idx of parsed.paramIndices) skipRefs.add(idx);
      continue;
    }

    if ((value === "window" || value === "globalThis" || value === "root") && next === "." && tokens[i + 2] && isIdent(tokens[i + 2].value)) {
      const afterProp = tokens[i + 3] && tokens[i + 3].value;
      if (afterProp === "=") projectGlobals.add(tokens[i + 2].value);
    }

    if (!isIdent(value) || KEYWORDS.has(value) || skipRefs.has(i)) continue;
    if (prev === ".") continue;
    if (next === ":" && prev !== "?") continue;
    if (prev === ":" && tokens[i - 2] && tokens[i - 2].value === "?") continue;
    scope.refs.push(token);
  }
}

function resolveRef(scope, name, projectGlobals) {
  if (KNOWN_GLOBALS.has(name) || projectGlobals.has(name)) return true;
  let current = scope;
  while (current) {
    if (current.declarations.has(name)) return true;
    current = current.parent;
  }
  return false;
}

function collectUnresolved(scope, projectGlobals, errors) {
  for (const ref of scope.refs) {
    if (!resolveRef(scope, ref.value, projectGlobals)) {
      errors.push(`${path.relative(ROOT, scope.file)}:${ref.line}:${ref.column} '${ref.value}' is not defined`);
    }
  }
  for (const child of scope.children) collectUnresolved(child, projectGlobals, errors);
}

function jsFilesForEval(evalDir) {
  const previewNames = ["index.html", "elevator_sim.html", "elevator_simulation.html", "test.html"];
  for (const previewName of previewNames) {
    const previewPath = path.join(evalDir, previewName);
    if (!fs.existsSync(previewPath)) continue;
    const html = fs.readFileSync(previewPath, "utf8");
    const scripts = [];
    const scriptRe = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi;
    let match;
    while ((match = scriptRe.exec(html))) {
      const src = match[1];
      const lower = src.toLowerCase();
      if (lower.includes("://") || lower.startsWith("data:") || lower.startsWith("about:")) continue;
      if (src.startsWith("/") || src.startsWith("\\")) continue;
      const scriptPath = path.resolve(evalDir, src);
      if (!scriptPath.startsWith(path.resolve(evalDir))) continue;
      if (fs.existsSync(scriptPath) && scriptPath.toLowerCase().endsWith(".js")) {
        scripts.push(scriptPath);
      }
    }
    if (scripts.length) return Array.from(new Set(scripts));
  }
  return fs.readdirSync(evalDir)
    .filter((name) => name.toLowerCase().endsWith(".js"))
    .filter((name) => !name.toLowerCase().endsWith("_test.js"))
    .map((name) => path.join(evalDir, name));
}

function staticCheckEval(evalDir) {
  const jsFiles = jsFilesForEval(evalDir);
  const syntaxErrors = [];
  for (const filePath of jsFiles) {
    const result = spawnSync(process.execPath, ["--check", filePath], { encoding: "utf8" });
    if (result.status !== 0) {
      const relFile = path.relative(ROOT, filePath);
      const lines = (result.stderr || result.stdout || "")
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line && !line.startsWith("at ") && !line.startsWith("Node.js"));
      if (lines[0] && path.resolve(lines[0].split(":").slice(0, -1).join(":")) === filePath) {
        lines[0] = lines[0].replace(filePath, relFile);
      }
      const syntaxLineIndex = lines.findIndex((line) => /^SyntaxError\b/.test(line));
      const usefulLines = syntaxLineIndex >= 0 ? lines.slice(0, syntaxLineIndex + 1) : lines.slice(0, 4);
      const message = usefulLines.join(" | ");
      syntaxErrors.push(message || `${relFile}: syntax check failed`);
    }
  }

  const globalScope = makeScope(null, "global", "");
  const projectGlobals = new Set();
  const rootDeclarations = new Map();
  for (const filePath of jsFiles) collectDeclarationsAndRefs(filePath, globalScope, projectGlobals, rootDeclarations);

  const referenceErrors = [];
  for (const child of globalScope.children) collectUnresolved(child, projectGlobals, referenceErrors);
  const duplicateErrors = [];
  for (const [name, declarations] of rootDeclarations.entries()) {
    if (declarations.length < 2) continue;
    const locations = declarations
      .map((decl) => `${path.relative(ROOT, decl.file)}:${decl.line}:${decl.column}`)
      .join(", ");
    duplicateErrors.push(`Duplicate top-level lexical declaration '${name}' in classic scripts: ${locations}`);
  }
  const staticErrors = [...syntaxErrors, ...duplicateErrors, ...referenceErrors];
  return {
    checked_at: new Date().toISOString(),
    files_checked: jsFiles.map((filePath) => path.relative(ROOT, filePath)),
    static_errors: Array.from(new Set(staticErrors)).slice(0, 30),
    static_warnings: [],
  };
}

function targets(arg) {
  if (!arg || arg === "--all") {
    if (!fs.existsSync(EVALS_DIR)) return [];
    return fs.readdirSync(EVALS_DIR)
      .map((name) => path.join(EVALS_DIR, name))
      .filter((item) => fs.statSync(item).isDirectory());
  }
  const direct = path.resolve(ROOT, arg);
  return fs.existsSync(direct) && fs.statSync(direct).isDirectory() ? [direct] : [];
}

if (require.main === module) {
  const dirs = targets(process.argv[2] || "--all");
  if (!dirs.length) {
    console.error("No evaluation directories found.");
    process.exit(1);
  }
  let hadErrors = false;
  for (const dir of dirs) {
    const result = staticCheckEval(dir);
    fs.writeFileSync(path.join(dir, "static_check.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    if (result.static_errors.length) hadErrors = true;
    const status = result.static_errors.length ? "errors" : "ok";
    console.log(`${path.relative(ROOT, dir)}: ${status}, static check written`);
    for (const err of result.static_errors.slice(0, 5)) {
      console.log(`  - ${err}`);
    }
  }
  process.exit(hadErrors ? 2 : 0);
}

module.exports = { staticCheckEval };
