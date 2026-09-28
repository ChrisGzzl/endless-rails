"use strict";
// Canvas-only entry: the mini-game adapter installs its canvas on
// globalThis.__endlessRailsCanvas before this module evaluates, then
// canvas-host boots the whole game with zero DOM involvement.
import "../view/surface.js";
import "../app/canvas-host.js";
