"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = process.argv[2];
const port = Number(process.argv[3] || 8123);
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8", ".ico": "image/x-icon",
};
const server = http.createServer((req, res) => {
  try {
    let urlPath;
    try { urlPath = decodeURIComponent(req.url.split("?")[0]); }
    catch { res.writeHead(400); return res.end("bad request"); }
    let file = path.join(root, urlPath === "/" ? "index.html" : urlPath);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (res.headersSent) return;
      if (err) { res.writeHead(404); return res.end("not found: " + urlPath); }
      res.writeHead(200, { "content-type": types[path.extname(file).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    });
  } catch (error) {
    if (!res.headersSent) { res.writeHead(500); res.end(String(error && error.message || error)); }
  }
});
server.on("clientError", (error, socket) => {
  try { socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"); } catch { socket.destroy(); }
});
server.listen(port, "127.0.0.1", () => console.log("serving " + root + " at http://127.0.0.1:" + port));
