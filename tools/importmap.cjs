"use strict";
// Rewrites the import map in index.html so every module of the runtime graph
// resolves to its release-versioned URL. GitHub Pages caches ES modules by
// URL and the entry's ?v= query does not reach transitive imports, so each
// module is mapped to "./src/...js?v=<entry version>".
//
// Usage: node tools/importmap.cjs   (run after changing the version or the graph)
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const htmlPath = path.join(root, "index.html");
const html = fs.readFileSync(htmlPath, "utf8");
const entry = html.match(/<script type="module" src="([^"?]+)\?v=([^"]+)"/);
if (!entry) throw new Error("index.html needs a versioned module entry");
const [, entrySrc, version] = entry;
const seen = new Set();
(function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/^import\s*(?:\{[^}]*\}\s*from\s*)?["']([^"']+)["']/gm)) visit(path.resolve(path.dirname(file), m[1]));
})(path.join(root, entrySrc));
const imports = {};
for (const file of [...seen].sort()) {
  const rel = "./" + path.relative(root, file).replace(/\\/g, "/");
  if (rel === "./" + entrySrc) continue;
  imports[rel] = `${rel}?v=${version}`;
}
const next = html.replace(/<script type="importmap">[^<]*<\/script>/, `<script type="importmap">${JSON.stringify({ imports })}</script>`);
fs.writeFileSync(htmlPath, next);
console.log(`import map: ${Object.keys(imports).length} modules at ${version}`);
