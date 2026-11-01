// 远山与云雾。每层山只生成一次缓存到离屏画布，之后按相机视差贴图。
import { makeCanvas } from '../core/canvas.js';
import { fbm1, noise1, Rng } from '../core/noise.js';
import { applyCamera } from '../core/camera.js';
import { clamp, lerp } from '../core/math.js';
import { stroke, blob, rgba, inkRGB } from '../ink/brush.js';

const cache = new Map();

// 主机位的三层远山（世界坐标）
export const MASTER_RANGES = [
  {
    id: 'far', seed: 11, x0: -700, x1: 2700, baseY: 700, amp: 300, freq: 0.0021, tone: 0.32, blur: 3.2, depth: 260,
    parallax: 0.12, texture: 0, peaks: [{ x: 120, h: 0.55, w: 260 }, { x: 640, h: 0.25, w: 180 }, { x: 1700, h: 0.65, w: 220 }, { x: 2050, h: 0.35, w: 260 }],
  },
  {
    id: 'mid', seed: 23, x0: -700, x1: 2700, baseY: 720, amp: 210, freq: 0.0032, tone: 0.48, blur: 1.6, depth: 220,
    parallax: 0.22, texture: 0.4, peaks: [{ x: -80, h: 0.7, w: 170 }, { x: 420, h: 0.5, w: 140 }, { x: 900, h: 0.25, w: 160 }, { x: 1560, h: 0.35, w: 150 }, { x: 2200, h: 0.6, w: 160 }],
  },
  {
    id: 'near', seed: 37, x0: -700, x1: 2700, baseY: 790, amp: 150, freq: 0.0045, tone: 0.62, blur: 0.6, depth: 200,
    parallax: 0.38, texture: 1, peaks: [{ x: 60, h: 0.9, w: 120 }, { x: 330, h: 0.55, w: 110 }, { x: 760, h: 0.2, w: 130 }, { x: 1500, h: -0.6, w: 500 }, { x: 2200, h: 0.3, w: 200 }],
  },
];

// 山脊在 x 处的高度（与 ridgeOf 同一公式），供远景点景（塔、小树）贴在山脊上
export function ridgeY(L, x) {
  let h = fbm1(x * L.freq, L.seed, 5) * 0.45 + 0.35;
  h += Math.abs(noise1(x * L.freq * 3.1, L.seed + 3)) * 0.12;
  for (const pk of L.peaks) h += pk.h * Math.exp(-Math.pow((x - pk.x) / pk.w, 2));
  return L.baseY - L.amp * h;
}

function ridgeOf(L) {
  const pts = [];
  for (let x = L.x0; x <= L.x1; x += 5) {
    let h = fbm1(x * L.freq, L.seed, 5) * 0.45 + 0.35;
    h += Math.abs(noise1(x * L.freq * 3.1, L.seed + 3)) * 0.12;
    for (const pk of L.peaks) h += pk.h * Math.exp(-Math.pow((x - pk.x) / pk.w, 2));
    pts.push([x, L.baseY - L.amp * h]);
  }
  return pts;
}

function build(L, scale, color) {
  const R = ridgeOf(L);
  let top = Infinity;
  for (const p of R) top = Math.min(top, p[1]);
  const y0 = top - 60, y1 = L.baseY + L.depth + 40;
  const wW = L.x1 - L.x0, wH = y1 - y0;
  const cv = makeCanvas(wW * scale, wH * scale);
  const ctx = cv.ctx;
  ctx.setTransform(scale, 0, 0, scale, -L.x0 * scale, -y0 * scale);
  const col = color || inkRGB(L.tone);
  // 1) 沿山脊向下渐淡的墨带
  const bands = 18;
  const bh = L.depth / bands;
  ctx.filter = `blur(${(L.blur * scale + bh * scale * 0.35).toFixed(1)}px)`;
  for (let b = 0; b < bands; b++) {
    const a = Math.pow(1 - b / bands, 1.6) * 0.34;
    ctx.beginPath();
    ctx.moveTo(R[0][0], R[0][1] + b * bh);
    for (const p of R) ctx.lineTo(p[0], p[1] + b * bh + noise1(p[0] * 0.01, L.seed + b) * bh * 0.6);
    for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1] + (b + 1.4) * bh);
    ctx.closePath();
    ctx.fillStyle = rgba(col, a);
    ctx.fill();
  }
  ctx.filter = L.blur > 1.5 ? `blur(${(L.blur * scale * 0.5).toFixed(1)}px)` : 'none';
  // 2) 山脊线：断续的干笔
  const rng = new Rng(L.seed);
  let i = 0;
  while (i < R.length - 4) {
    const n = Math.floor(rng.range(14, 60));
    const seg = R.slice(i, Math.min(R.length, i + n));
    stroke(ctx, seg, { w: rng.range(2, 5) * (0.6 + L.texture * 0.6), tone: clamp(L.tone + 0.15), dry: 0.55, seed: L.seed * 7 + i, color, alpha: 0.75, taperIn: 0.3, taperOut: 0.3 });
    i += n + Math.floor(rng.range(2, 18));
  }
  // 3) 皴：从山脊往下的短干笔
  if (L.texture > 0) {
    const count = Math.round(((L.x1 - L.x0) / 34) * L.texture);
    for (let k = 0; k < count; k++) {
      const idx = Math.floor(rng.range(0, R.length - 3));
      const p = R[idx];
      const q = R[Math.min(idx + 3, R.length - 1)];
      const slope = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const dir = Math.PI / 2 + slope * 0.6 + rng.range(-0.3, 0.3);
      const len = rng.range(18, 70) * (0.6 + L.texture * 0.6);
      const off = rng.range(2, 40);
      const a = [p[0], p[1] + off];
      const b = [a[0] + Math.cos(dir) * len, a[1] + Math.sin(dir) * len];
      const m = [(a[0] + b[0]) / 2 + rng.range(-6, 6), (a[1] + b[1]) / 2];
      stroke(ctx, [a, m, b], { w: rng.range(1.5, 3.5), tone: clamp(L.tone + 0.05), dry: 0.75, seed: k + L.seed, color, alpha: rng.range(0.12, 0.32), taperIn: 0.2, taperOut: 0.5 });
    }
    // 苔点
    ctx.filter = 'none';
    const dots = Math.round(((L.x1 - L.x0) / 90) * L.texture);
    for (let k = 0; k < dots; k++) {
      const idx = Math.floor(rng.range(0, R.length));
      const p = R[idx];
      const cl = rng.int(1, 4);
      for (let j = 0; j < cl; j++) blob(ctx, p[0] + rng.range(-7, 7), p[1] + rng.range(-1, 6), rng.range(0.8, 1.9), { tone: clamp(L.tone + 0.15), alpha: 0.55, seed: k * 7 + j });
    }
  }
  ctx.filter = 'none';
  return { canvas: cv, x: L.x0, y: y0, w: wW, h: wH };
}

export function drawRange(ctx, L, cam, base, opt = {}) {
  const scale = base * (opt.res ?? 1.0);
  const key = `${L.id}|${scale.toFixed(3)}|${opt.color ? opt.color.join(',') : ''}`;
  let c = cache.get(key);
  if (!c) { c = build(L, scale, opt.color); cache.set(key, c); }
  ctx.save();
  applyCamera(ctx, cam, L.parallax, base);
  if (opt.dx || opt.dy) ctx.translate(opt.dx || 0, opt.dy || 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = opt.alpha ?? 1;
  ctx.drawImage(c.canvas, c.x, c.y, c.w, c.h);
  ctx.restore();
}

// 云雾带：纸白色的柔和横带，缓慢漂移
export function drawMist(ctx, cam, base, bands, t) {
  ctx.save();
  for (const b of bands) {
    applyCamera(ctx, cam, b.parallax ?? 0.3, base);
    ctx.globalCompositeOperation = 'source-over';
    const drift = (b.speed ?? 4) * t;
    const n = b.puffs ?? 7;
    for (let k = 0; k < n; k++) {
      const x = b.x0 + ((k / n) * (b.x1 - b.x0) + drift + noise1(k * 1.7, b.seed ?? 1) * 120) % (b.x1 - b.x0 + 400) - 200;
      const w = (b.w ?? 520) * (0.7 + 0.5 * (noise1(k * 2.3, (b.seed ?? 1) + 5) * 0.5 + 0.5));
      const h = (b.h ?? 60) * (0.8 + 0.4 * (noise1(k * 3.1, (b.seed ?? 1) + 9) * 0.5 + 0.5));
      const y = b.y + noise1(k * 0.9 + t * 0.03, (b.seed ?? 1) + 2) * (b.h ?? 60) * 0.4;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, `rgba(255,255,255,${b.alpha ?? 0.85})`);
      g.addColorStop(0.6, `rgba(255,255,255,${(b.alpha ?? 0.85) * 0.5})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(w, h);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}
