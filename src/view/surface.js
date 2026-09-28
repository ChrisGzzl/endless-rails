"use strict";
// The single canvas surface every renderer reads. Hosts install their canvas
// here before the first frame: the web page (game.js), the DOM-free canvas
// boot (canvas-host.js) and the mini-game adapter all call setSurface with
// their own canvas element. No runtime module may grab a canvas by querying
// the document - the host owns the element, this module owns the drawing
// state, and resize goes through resizeSurface so every reader stays in sync.

export const TAU = Math.PI * 2;

export let canvas = null;
export let ctx = null;
export let W = 390;
export let H = 680;

export function setSurface(nextCanvas, width = nextCanvas.width, height = nextCanvas.height) {
  canvas = nextCanvas;
  ctx = nextCanvas.getContext("2d");
  W = width;
  H = height;
}

export function resizeSurface(width, height) {
  W = width;
  H = height;
}
