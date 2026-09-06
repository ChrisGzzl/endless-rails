"use strict";

// Rendering stays independent of combat rules and uses the game's logical 390 × 680 canvas.
const terrainPalettes = [
  { ground: "#454637", shade: "#292f28", stone: "#63604b", edge: "#888066", dust: "#bba178" },
  { ground: "#554436", shade: "#302e26", stone: "#745e45", edge: "#998265", dust: "#cfaa77" },
  { ground: "#384a49", shade: "#222f32", stone: "#506460", edge: "#7a8c78", dust: "#a6b9a0" },
  { ground: "#494739", shade: "#2b312b", stone: "#66664e", edge: "#8e9270", dust: "#c2c096" },
  { ground: "#53403b", shade: "#2c2828", stone: "#756052", edge: "#a18469", dust: "#c59476" },
];
const terrainPaint = new Map();
const terrainSeeds = Array.from({ length: 92 }, (_, i) => {
  const hash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  return { x: hash(i + 1), y: hash(i + 94), size: hash(i + 181), angle: hash(i + 273) * Math.PI * 2 };
});

function shape(points, fill, stroke, width = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function line(x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function glow(x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color); gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
function drawBackground() {
  const index = Math.max(0, Math.min(4, state.station - 1));
  const palette = terrainPalettes[index];
  if (!terrainPaint.has(index)) {
    const paint = ctx.createLinearGradient(0, 0, W, H);
    paint.addColorStop(0, palette.ground); paint.addColorStop(1, palette.shade);
    terrainPaint.set(index, paint);
  }
  ctx.fillStyle = terrainPaint.get(index); ctx.fillRect(0, 0, W, H);
  const offset = (state.visualTime || 0) * WORLD_SPEED;
  const seedShift = (state.runSeed % 997) / 997;
  for (let i = 0; i < terrainSeeds.length; i++) {
    const seed = terrainSeeds[i];
    const speed = i < 12 ? .35 : .85;
    const x = (((seed.x + seedShift) * (W + 140) - motion.FORWARD.x * offset * speed) % (W + 140) + W + 140) % (W + 140) - 70;
    const y = (((seed.y + seedShift * .7) * (H + 140) - motion.FORWARD.y * offset * speed) % (H + 140) + H + 140) % (H + 140) - 70;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(seed.angle);
    if (i < 12) {
      const r = 20 + seed.size * 33;
      shape([[-r, -r * .2], [-r * .4, -r * .65], [r * .5, -r * .5], [r, 0], [r * .2, r * .45], [-r * .8, r * .3]], "#18271e27");
      line(-r * .7, -4, r * .2, -r * .3, "#9c987115", 2);
    } else if (i < 37) {
      const r = 4 + seed.size * 12;
      shape([[-r + 3, 3], [-r * .6, -r * .7], [r * .4, -r * .8], [r + 5, 2], [r * .6 + 5, r * .5], [-r * .4, r * .7]], "#121b1866");
      shape([[-r, 0], [-r * .6, -r * .7], [r * .4, -r * .8], [r, -2], [r * .6, r * .4], [-r * .4, r * .5]], palette.stone);
      shape([[-r * .6, -r * .7], [r * .4, -r * .8], [r * .25, -1], [-r * .45, r * .1]], palette.edge);
    } else if (i < 48) {
      line(-7, 1, 7, -2, palette.stone, 2);
      line(-4, -5, 2, 3, palette.edge, 1);
      ctx.fillStyle = palette.shade; ctx.fillRect(-2, -2, 3, 3);
    } else {
      ctx.globalAlpha = .35; ctx.fillStyle = palette.dust;
      ctx.fillRect(0, 0, 1 + seed.size * 2, 1);
      ctx.fillRect(5, 4, 2, 1);
    }
    ctx.restore();
  }
  if (state.routeModifiers.weather === "dust") {
    ctx.fillStyle = "#daa45c12"; ctx.fillRect(0, 0, W, H);
  }
}
function drawRails() {
  const { x: fx, y: fy } = motion.FORWARD;
  const nx = -fy, ny = fx, length = balance.RAIL_HALF_LENGTH;
  const track = (offset, color, width) => line(state.train.x + nx * offset - fx * length, state.train.y + ny * offset - fy * length, state.train.x + nx * offset + fx * length, state.train.y + ny * offset + fy * length, color, width);
  track(0, "#161d1866", 77); track(0, "#33372c", 63); track(0, "#65604455", 51);
  const scroll = (state.visualTime || 0) * WORLD_SPEED * 2.6 % 26;
  for (let t = -length - scroll; t < length; t += 26) {
    const x = state.train.x + fx * t, y = state.train.y + fy * t;
    line(x - nx * 27 + 1, y - ny * 27 + 3, x + nx * 27 + 1, y + ny * 27 + 3, "#151e19", 7);
    line(x - nx * 26, y - ny * 26, x + nx * 26, y + ny * 26, "#796747", 5);
    line(x - nx * 24 - fx * 2, y - ny * 24 - fy * 2, x + nx * 24 - fx * 2, y + ny * 24 - fy * 2, "#ab8a58", 1);
  }
  for (const side of [-1, 1]) {
    track(side * 16 + 2, "#151d19", 8);
    track(side * 16, "#786c51", 5);
    track(side * 16 - 1, "#b9b293", 1.5);
  }
}
function drawTrain() {
  const angle = Math.atan2(motion.FORWARD.y, motion.FORWARD.x);
  for (let i = state.trainLength - 1; i >= 0; i--) {
    const p = carPosition(i), half = balance.CAR_LENGTH / 2, height = balance.CAR_HEIGHT / 2;
    ctx.save(); ctx.translate(p.x + 5, p.y + 8); ctx.rotate(angle);
    ctx.fillStyle = "#08141088"; ctx.fillRect(-half - 3, -height - 2, half * 2 + 7, height * 2 + 5); ctx.restore();
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle);
    if (i > 0) { ctx.fillStyle = "#b3a384"; ctx.fillRect(half, -3, balance.CAR_SPACING - balance.CAR_LENGTH + 3, 6); }
    for (const side of [-1, 1]) {
      ctx.fillStyle = "#131d19"; ctx.fillRect(-half + 4, side * (height + 3) - 3, 12, 6); ctx.fillRect(half - 16, side * (height + 3) - 3, 12, 6);
      line(-half + 5, side * (height + 4), half - 6, side * (height + 4), "#6c7560", 1);
    }
    const body = i === 0 ? "#b57142" : i % 2 ? "#77754d" : "#8c613e";
    shape([[-half, -height + 3], [-half + 4, -height], [half - 4, -height], [half, -height + 4], [half, height - 3], [half - 3, height], [-half, height]], body, "#151e18", 3);
    line(-half + 4, -height + 2, half - 5, -height + 2, "#ebbd79", 2);
    line(-half + 2, height - 2, half - 2, height - 2, "#573c29", 3);
    ctx.fillStyle = "#ce9b5b";
    for (const x of [-half + 5, half - 5]) for (const y of [-height + 5, height - 5]) ctx.fillRect(x - 1, y - 1, 2, 2);
    if (i === 0) {
      // Engine roof, cooling vents, cab glass and front plough.
      ctx.fillStyle = "#573e2e"; ctx.fillRect(-half + 6, -10, 19, 20);
      ctx.fillStyle = "#282e24"; ctx.fillRect(-half + 8, -8, 15, 16);
      for (let x = -half + 9; x < -2; x += 4) line(x, -7, x, 7, "#8c7750", 1);
      ctx.fillStyle = "#ddac66"; ctx.fillRect(3, -13, 11, 26);
      ctx.fillStyle = "#213e38"; ctx.fillRect(6, -11, 7, 9); ctx.fillRect(6, 2, 7, 9);
      line(7, -10, 11, -10, "#c0e0bf", 1); line(7, 3, 11, 3, "#c0e0bf", 1);
      shape([[half - 1, -height + 2], [half + 9, -height - 2], [half + 12, 0], [half + 9, height + 2], [half - 1, height - 2]], "#485042", "#151c17", 2);
      for (const y of [-10, 10]) {
        glow(half + 4, y, 13, "#f4c57644");
        ctx.fillStyle = "#ffe4a0"; ctx.fillRect(half + 1, y - 2, 4, 4);
      }
      const beam = ctx.createLinearGradient(half + 6, 0, half + 115, 0);
      beam.addColorStop(0, "#ffdb861b"); beam.addColorStop(1, "#ffdb8600");
      shape([[half + 6, -11], [half + 118, -42], [half + 118, 42], [half + 6, 11]], beam);
    } else {
      ctx.fillStyle = i % 2 ? "#4b5944" : "#65513b"; ctx.fillRect(-half + 6, -height + 6, half * 2 - 12, height * 2 - 12);
      for (let x = -half + 9; x < half - 6; x += 7) {
        line(x, -height + 5, x, height - 5, "#1d2b2188", 2);
        line(x + 1, -height + 6, x + 1, height - 6, "#b7a46b77", 1);
      }
      ctx.fillStyle = "#d0b477"; ctx.fillRect(-4, -4, 8, 8);
      ctx.fillStyle = "#3a4937"; ctx.fillRect(-2, -2, 4, 4);
    }
    ctx.restore();
  }
}
function drawEnemies() {
  for (const e of state.enemies) {
    if (e.dead || e.delay > 0) continue;
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(Math.atan2(state.train.y - e.y, state.train.x - e.x));
    const r = e.r, shell = e.hit > .4 ? "#f2d8a1" : e.elite ? "#b87649" : e.hue > .5 ? "#849068" : "#5d7c6b";
    ctx.fillStyle = "#091b1455"; ctx.beginPath(); ctx.ellipse(3, 5, r + 4, r, 0, 0, TAU); ctx.fill();
    for (const side of [-1, 1]) {
      for (let j = -1; j <= 1; j++) {
        const gait = Math.sin((state.visualTime || 0) * 16 + j * 2 + e.hue * 9) * 2;
        const x = j * r * .6;
        line(x, side * r * .4, x - 4 + gait, side * (r + 4), "#172c21", 4);
        line(x - 4 + gait, side * (r + 4), x + 2 + gait, side * (r + 5), "#b1a471", 2);
      }
    }
    shape([[-r, -r * .45], [-r * .5, -r * .75], [r * .4, -r * .6], [r, 0], [r * .4, r * .6], [-r * .5, r * .75], [-r, r * .45]], shell, "#14231c", 2);
    shape([[-r * .8, -r * .3], [-r * .3, -r * .5], [r * .3, -r * .4], [r * .5, 0], [-r * .7, 0]], "#c2c39555");
    line(-r * .5, 2, r * .1, 2, "#24392a", 2);
    ctx.fillStyle = e.elite ? "#ffe39c" : "#f4b47f"; ctx.fillRect(r * .45, -3, 4, 6);
    if (e.elite) { line(-5, -r * .5, -1, -r * .5, "#f5cb7e", 2); line(-5, r * .5, -1, r * .5, "#f5cb7e", 2); }
    ctx.restore();
    if (e.hp < e.maxHp) {
      ctx.fillStyle = "#15291f"; ctx.fillRect(e.x - 15, e.y + e.r + 10, 30, 3);
      ctx.fillStyle = e.elite ? "#e8b772" : "#c2d095"; ctx.fillRect(e.x - 15, e.y + e.r + 10, 30 * Math.max(0, e.hp / e.maxHp), 2);
    }
  }
}
function drawBoss() {
  const b = state.boss;
  if (!b || b.dead) return;
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(state.train.y - b.y, state.train.x - b.x));
  ctx.fillStyle = "#11211988"; ctx.fillRect(-38, -29, 80, 66);
  for (const side of [-1, 1]) {
    ctx.fillStyle = "#1b251e"; ctx.fillRect(-32, side * 25 - 7, 62, 14);
    for (let x = -29; x < 29; x += 7) line(x, side * 25 - 5, x, side * 25 + 5, "#8a7754", 3);
  }
  shape([[-34, -22], [20, -22], [34, -12], [34, 12], [20, 22], [-34, 22]], b.hit ? "#dfb071" : "#995d3e", "#17271f", 3);
  ctx.fillStyle = "#423c2e"; ctx.fillRect(-27, -16, 27, 32);
  for (let y = -12; y < 14; y += 5) line(-25, y, -2, y, "#a08b5b", 2);
  shape([[24, -16], [49, 0], [24, 16]], "#aca581", "#243229", 2);
  line(27, -10, 40, 1, "#e7ce8c", 2);
  glow(13, 0, 22, "#ecb66b66"); ctx.fillStyle = "#ffe6a9"; ctx.fillRect(6, -7, 13, 14);
  ctx.restore();
}
function droneSprite(x, y, scale, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.fillStyle = "#091b1644"; ctx.beginPath(); ctx.ellipse(4, 11, 19, 9, 0, 0, TAU); ctx.fill();
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    line(side * 3, front * 5, side * 15, front * 11, "#192f29", 5);
    line(side * 3, front * 5 - 1, side * 15, front * 11 - 1, "#b3be9f", 2);
    ctx.fillStyle = "#16332d"; ctx.beginPath(); ctx.ellipse(side * 16, front * 12, 7, 5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
    line(side * 16 - 5, front * 12, side * 16 + 5, front * 12, "#c9e2c380", 1);
    ctx.fillStyle = "#e1e5be"; ctx.fillRect(side * 16 - 1, front * 12 - 1, 2, 2);
  }
  shape([[-6, -12], [5, -12], [9, 4], [4, 12], [-5, 12], [-9, 4]], "#d2c9a2", "#213b30", 2);
  ctx.fillStyle = "#345549"; ctx.fillRect(-4, -7, 8, 11);
  ctx.fillStyle = color; ctx.fillRect(-3, -5, 6, 5);
  line(-3, 7, 3, 7, "#716f4e", 2);
  glow(0, -3, 17, "#99ead733"); ctx.restore();
}
function drawDrone() {
  const time = state.visualTime || 0;
  for (const wingman of effects.wingmanPositions(state.drone, level("wingman"), state.railClock)) droneSprite(wingman.x, wingman.y, .58, "#ecc17b");
  ctx.save(); ctx.translate(state.drone.x, state.drone.y);
  ctx.strokeStyle = "#93d6ba44"; ctx.lineWidth = 1;
  ctx.setLineDash([5, 10]); ctx.beginPath(); ctx.arc(0, 0, 29, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  droneSprite(state.drone.x, state.drone.y + Math.sin(time * 3) * 1.5, 1, "#a1e3d1");
}
function drawShots() {
  for (const shot of state.shots) {
    const trail = shot.missile ? .05 : .023;
    line(shot.x, shot.y, shot.x - shot.vx * trail, shot.y - shot.vy * trail, shot.color, shot.missile ? 4 : 2);
    ctx.fillStyle = "#f5efcf"; ctx.fillRect(shot.x - 1, shot.y - 1, 2, 2);
  }
}
