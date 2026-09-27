"use strict";
// Late bindings for view code that lives in panels loaded after game.js
// (armory's pause inspector). game.js registers calls; armory fills them in
// during its own evaluation. A no-op default keeps load-time calls safe.
export const uiHooks = { renderPause() {} };
