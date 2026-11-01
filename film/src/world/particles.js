// 无状态粒子：花瓣、落叶、雪花。位置只由种子和时间决定。
import { hash, noise1 } from '../core/noise.js';
import { TAU, lerp } from '../core/math.js';
import { rgba, inkRGB, blob, whiteOf } from '../ink/brush.js';
import { C } from './palette.js';

function wrap(v, a, b) {
  const w = b - a;
  return a + ((((v - a) % w) + w) % w);
}

// region: [x0, y0, x1, y1]（世界坐标）；vx/vy: 速度；count；size
export function drawPetals(ctx, t, o = {}) {
  const [x0, y0, x1, y1] = o.region || [0, 0, 1920, 1080];
  const n = o.count ?? 60;
  const seed = o.seed ?? 1;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const h1 = hash(seed, i), h2 = hash(seed, i + 101), h3 = hash(seed, i + 202);
    const sp = 0.6 + h3 * 0.8;
    const x = wrap(x0 + h1 * (x1 - x0) + (o.vx ?? 60) * t * sp + Math.sin(t * 1.3 + i) * 18, x0 - 40, x1 + 40);
    const y = wrap(y0 + h2 * (y1 - y0) + (o.vy ?? 40) * t * sp + Math.sin(t * 0.9 + i * 1.7) * 12, y0 - 40, y1 + 40);
    const s = (o.size ?? 3.2) * (0.6 + h3 * 0.8);
    const rot = t * (1.5 + h1 * 2) + i;
    const flip = Math.abs(Math.cos(t * (2 + h2 * 3) + i));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, 0.25 + flip * 0.75);
    const W8 = whiteOf(ctx);
    if (W8) {
      W8.beginPath();
      W8.ellipse(0, 0, s, s * 0.7, 0, 0, TAU);
      W8.fillStyle = 'rgba(255,255,255,0.95)';
      W8.fill();
    }
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 0.7, 0, 0, TAU);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = rgba(h1 < 0.3 ? [214, 150, 150] : inkRGB(0.4), 0.5);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

export function drawLeavesFalling(ctx, t, o = {}) {
  const [x0, y0, x1, y1] = o.region || [0, 0, 1920, 1080];
  const n = o.count ?? 30;
  const seed = o.seed ?? 3;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < n; i++) {
    const h1 = hash(seed, i), h2 = hash(seed, i + 101), h3 = hash(seed, i + 202);
    const sp = 0.6 + h3 * 0.8;
    const x = wrap(x0 + h1 * (x1 - x0) + (o.vx ?? 40) * t * sp + Math.sin(t * 1.1 + i) * 30, x0 - 40, x1 + 40);
    const y = wrap(y0 + h2 * (y1 - y0) + (o.vy ?? 50) * t * sp, y0 - 40, y1 + 40);
    const col = h1 < 0.4 ? C.autumnOchre : h1 < 0.75 ? C.autumnRust : C.autumnPale;
    const s = (o.size ?? 5) * (0.7 + h3 * 0.6);
    blob(ctx, x, y, s, { fill: rgba(col, 0.8), sx: 1.6, sy: 0.6 * (0.3 + Math.abs(Math.cos(t * 2.4 + i))), angle: t * (1 + h2) + i, seed: i, rough: 0.12 });
  }
  ctx.restore();
}

export function drawSnowfall(ctx, t, o = {}) {
  const [x0, y0, x1, y1] = o.region || [0, 0, 1920, 1080];
  const n = o.count ?? 160;
  const seed = o.seed ?? 5;
  const W8 = whiteOf(ctx) || ctx;
  W8.save();
  for (let i = 0; i < n; i++) {
    const h1 = hash(seed, i), h2 = hash(seed, i + 101), h3 = hash(seed, i + 202);
    const depth = 0.4 + h3 * 0.9;
    const x = wrap(x0 + h1 * (x1 - x0) + (o.vx ?? 20) * t * depth + Math.sin(t * 0.8 + i) * 14 * depth, x0 - 20, x1 + 20);
    const y = wrap(y0 + h2 * (y1 - y0) + (o.vy ?? 55) * t * depth, y0 - 20, y1 + 20);
    const r = (o.size ?? 2.2) * depth;
    W8.beginPath();
    W8.arc(x, y, r, 0, TAU);
    W8.fillStyle = `rgba(255,255,255,${0.75 + 0.25 * h1})`;
    W8.fill();
  }
  W8.restore();
}
