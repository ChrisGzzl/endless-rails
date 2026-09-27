"use strict";
// Leaf module: the DOM lookup helper shared by every interface module.
// It must stay dependency-free so panels can safely use it while the
// game module is still mid-evaluation.
export const $ = id => document.getElementById(id);
