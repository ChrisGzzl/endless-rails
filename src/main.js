"use strict";
// Composition root and the single module entry referenced by index.html.
// ES modules evaluate depth-first in import order, so this list is now the
// one load-order contract that used to live in the 18 script tags.
import "./core/cloud-config.js";
import "./core/cloud-sync.js";
import "./app/game.js";
import "./app/meta-ui.js";
import "./app/armory.js";
import "./app/display.js";
import "./app/settings.js";
import "./app/cloud-ui.js";
