"use strict";
// Composition root and the single module entry of index.html and of the
// mini-game bundle. ES modules evaluate depth-first in import order: the
// optional test-save modules first, then the canvas host, which boots the
// engine and draws the entire game on the page's (or adapter's) canvas.
import "./core/cloud-config.js";
import "./core/cloud-sync.js";
import "./app/canvas-host.js";
