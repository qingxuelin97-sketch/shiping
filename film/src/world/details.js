// v2 场景细节：远景村落与塔、山脊点景小树、山坡野花与石块、小路石阶、
// 小屋院墙与柴门、夏夜萤火虫、秋天雁阵、雪地脚印
import { applyCamera } from '../core/camera.js';
import { Rng, noise1, hash } from '../core/noise.js';
import { lerp, clamp, TAU, along } from '../core/math.js';
import { stroke, blob, rgba, inkRGB, softDot, line, whiteOf } from '../ink/brush.js';
import { ridgeY } from './mountains.js';
import { hillY, PATH, drawRock } from './landscape.js';
import { C } from './palette.js';

// ---------- 远景：山谷里的村落（白墙黑瓦，半掩在雾里） ----------
const VILLAGE = (() => {
  const r = new Rng(77);
  const out = [];
  for (let k = 0; k < 9; k++) {
    out.push({ x: 430 + k * 34 + r.range(-10, 10), y: 818 + r.range(-12, 10) + (k % 3) * 4, w: r.range(22, 36), h: r.range(9, 14), roof: r.range(8, 12) });
  }
  return out.sort((a, b) => a.y - b.y);
})();

export function drawVillage(ctx, cam, base, o = {}) {
  const p = o.parallax ?? 0.4;
  const W8 = whiteOf(ctx);
  ctx.save();
  applyCamera(ctx, cam, p, base);
  if (W8) applyCamera(W8, cam, p, base);
  const tone = 0.42;
  for (const hz of VILLAGE) {
    const { x, y, w, h, roof } = hz;
    // 白墙（白粉）
    if (W8) {
      W8.save();
      W8.globalAlpha = (o.snow ? 0.6 : 0.55) * (o.alpha ?? 1);
      W8.fillStyle = '#fff';
      W8.fillRect(x - w / 2, y - h, w, h);
      W8.restore();
    }
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgba(inkRGB(tone * 0.5), 0.5 * (o.alpha ?? 1));
    ctx.fillRect(x - w / 2, y - h, w, h);
    // 黑瓦屋顶：两端微翘
    ctx.fillStyle = rgba(inkRGB(tone), 0.85 * (o.alpha ?? 1));
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - 4, y - h + 1);
    ctx.quadraticCurveTo(x - w / 2, y - h - roof * 0.2, x - w / 2 + 3, y - h - roof);
    ctx.lineTo(x + w / 2 - 3, y - h - roof);
    ctx.quadraticCurveTo(x + w / 2, y - h - roof * 0.2, x + w / 2 + 4, y - h + 1);
    ctx.closePath();
    ctx.fill();
    // 门
    ctx.fillStyle = rgba(inkRGB(tone * 0.8), 0.6 * (o.alpha ?? 1));
    ctx.fillRect(x - 2, y - h * 0.6, 4, h * 0.6);
    if (o.snow && W8) {
      W8.save();
      W8.globalAlpha = 0.85 * (o.alpha ?? 1);
      W8.fillStyle = '#fff';
      W8.fillRect(x - w / 2, y - h - roof, w, roof * 0.45);
      W8.restore();
    }
  }
  // 村边几株树
  const r = new Rng(78);
  for (let k = 0; k < 5; k++) {
    const tx = 420 + k * 70 + r.range(-15, 15), ty = 826 + r.range(-6, 6);
    line(ctx, [[tx, ty], [tx + r.range(-2, 2), ty - 16]], 1.4, inkRGB(tone + 0.1), 0.7);
    for (let j = 0; j < 6; j++) blob(ctx, tx + r.range(-7, 7), ty - 16 - r.range(0, 12), r.range(3, 5.5), { tone: tone + 0.05, alpha: 0.35 * (o.alpha ?? 1), seed: k * 9 + j });
  }
  ctx.restore();
  if (W8) W8.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------- 远山山脊上的一座小塔 ----------
export function drawPagoda(ctx, cam, base, L, o = {}) {
  const x = o.x ?? 452;
  const y = ridgeY(L, x) + 3;
  ctx.save();
  applyCamera(ctx, cam, L.parallax, base);
  ctx.globalCompositeOperation = 'multiply';
  const col = inkRGB(clamp(L.tone + 0.12));
  const a = 0.8 * (o.alpha ?? 1);
  let w = 14, yy = y;
  for (let k = 0; k < 7; k++) {
    const h = 6.2 - k * 0.35;
    ctx.fillStyle = rgba(col, a * 0.55);
    ctx.fillRect(x - w * 0.36, yy - h, w * 0.72, h);
    // 檐
    ctx.fillStyle = rgba(col, a);
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - 2, yy - h + 0.6);
    ctx.quadraticCurveTo(x, yy - h - 2.2, x + w / 2 + 2, yy - h + 0.6);
    ctx.lineTo(x + w * 0.4, yy - h - 1.4);
    ctx.lineTo(x - w * 0.4, yy - h - 1.4);
    ctx.closePath();
    ctx.fill();
    yy -= h + 1.4;
    w *= 0.88;
  }
  line(ctx, [[x, yy], [x, yy - 7]], 1.0, col, a);
  ctx.restore();
}

// ---------- 山脊上的点景小树 ----------
export function drawRidgeTrees(ctx, cam, base, L, xs, o = {}) {
  ctx.save();
  applyCamera(ctx, cam, L.parallax, base);
  ctx.globalCompositeOperation = 'multiply';
  const tone = clamp(L.tone + 0.1);
  xs.forEach((x, i) => {
    const y = ridgeY(L, x) + 2;
    const r = new Rng(300 + i);
    const h = r.range(14, 24);
    line(ctx, [[x, y], [x + r.range(-2, 2), y - h]], 1.3, inkRGB(tone), 0.75 * (o.alpha ?? 1));
    for (let j = 0; j < 5; j++) blob(ctx, x + r.range(-6, 6), y - h - r.range(-3, 8), r.range(2.5, 4.5), { tone, alpha: 0.4 * (o.alpha ?? 1), seed: i * 11 + j });
  });
  ctx.restore();
}

// ---------- 山坡野花与石块（世界坐标） ----------
const FLOWERS = (() => {
  const r = new Rng(91);
  const out = [];
  for (let k = 0; k < 150; k++) {
    const x = r.range(-200, 2000);
    const y0 = hillY(x);
    const y = y0 + 10 + Math.pow(r.next(), 1.6) * (1150 - y0);
    // 别落在大树根部和小路正中
    if (Math.abs(x - 1290) < 60 && y < 760) continue;
    out.push({ x, y, kind: r.next(), n: r.int(2, 5), s: r.range(1.4, 2.4) });
  }
  return out;
})();

export function drawWildflowers(ctx, t, o = {}) {
  const W8 = whiteOf(ctx);
  const amt = o.amount ?? 1;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  FLOWERS.forEach((f, i) => {
    if (hash(i, 5) > amt) return;
    const sw = noise1(t * 0.8 + i, 7) * 1.2;
    for (let j = 0; j < f.n; j++) {
      const x = f.x + (hash(i, j) - 0.5) * 9 + sw, y = f.y + (hash(j, i) - 0.5) * 5;
      if (f.kind < 0.45) {
        blob(ctx, x, y, f.s, { fill: rgba([234, 202, 92], 0.9), seed: i * 7 + j });
      } else if (f.kind < 0.7) {
        blob(ctx, x, y, f.s, { fill: rgba([234, 176, 186], 0.85), seed: i * 7 + j });
      } else if (W8) {
        W8.save();
        W8.globalAlpha = 0.9;
        W8.fillStyle = '#fff';
        W8.beginPath();
        W8.arc(x, y, f.s * 0.9, 0, TAU);
        W8.fill();
        W8.restore();
      }
    }
  });
  ctx.restore();
}

export function drawStones(ctx) {
  for (const [x, y, w, h, s] of [[868, 922, 16, 8, 3], [1004, 882, 12, 6, 5], [612, 1026, 22, 10, 7], [1132, 770, 10, 5, 9], [480, 1060, 26, 11, 11], [1510, 744, 14, 6, 13]]) {
    drawRock(ctx, x, y, w, h, s);
  }
}

// ---------- 小路靠近树的一段铺几级石阶 ----------
export function drawSteps(ctx, o = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let s = 0.06; s < 0.3; s += 0.034) {
    const a = along(PATH, s), b = along(PATH, s + 0.01);
    const d = [b.p[0] - a.p[0], b.p[1] - a.p[1]];
    const l = Math.hypot(d[0], d[1]) || 1;
    const n = [-d[1] / l, d[0] / l];
    const w = 10 + s * 10;
    line(ctx, [[a.p[0] - n[0] * w, a.p[1] - n[1] * w], [a.p[0] + n[0] * w, a.p[1] + n[1] * w]], 1.6, inkRGB(0.55), 0.55 * (o.alpha ?? 1));
  }
  ctx.restore();
}

// ---------- 小屋的院墙与柴门（墙用白粉，压一道瓦檐） ----------
export function drawCourtyard(ctx, t, o = {}) {
  const x0 = 342, y0 = 1010; // 从屋子右侧接出去
  const W8 = whiteOf(ctx);
  const pts = [[x0, y0 - 2], [x0 + 60, y0 - 6], [x0 + 104, y0 - 8]];
  const gate = [x0 + 104, x0 + 128];
  const pts2 = [[gate[1], y0 - 8], [gate[1] + 40, y0 - 6], [gate[1] + 70, y0 - 2]];
  const wallH = 20;
  for (const seg of [pts, pts2]) {
    const path = new Path2D();
    path.moveTo(seg[0][0], seg[0][1]);
    for (const q of seg) path.lineTo(q[0], q[1]);
    for (let i = seg.length - 1; i >= 0; i--) path.lineTo(seg[i][0], seg[i][1] - wallH);
    path.closePath();
    if (W8) {
      W8.save();
      W8.globalAlpha = 0.7;
      W8.fillStyle = '#fff';
      W8.fill(path);
      W8.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgba([226, 218, 204], 0.4);
    ctx.fill(path);
    // 墙头瓦檐
    stroke(ctx, seg.map((q) => [q[0], q[1] - wallH - 1]), { w: 4.5, tone: 0.85, dry: 0.3, seed: 51, taperIn: 0.05, taperOut: 0.05 });
    stroke(ctx, seg, { w: 1.6, tone: 0.7, dry: 0.5, seed: 52, alpha: 0.7 });
    ctx.restore();
    if (o.snow && W8) {
      W8.save();
      W8.globalAlpha = 0.9 * o.snow;
      W8.strokeStyle = '#fff';
      W8.lineWidth = 4;
      W8.lineCap = 'round';
      W8.beginPath();
      seg.forEach((q, i) => (i ? W8.lineTo(q[0], q[1] - wallH - 4) : W8.moveTo(q[0], q[1] - wallH - 4)));
      W8.stroke();
      W8.restore();
    }
  }
  // 柴门：两根门柱 + 几根竖木条
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (const gx of gate) line(ctx, [[gx, y0 - 8], [gx, y0 - 8 - wallH - 4]], 2.4, inkRGB(0.8), 0.9);
  for (let k = 0; k < 4; k++) {
    const gx = lerp(gate[0] + 3, gate[1] - 3, k / 3);
    line(ctx, [[gx, y0 - 9], [gx + 1, y0 - 9 - wallH * 0.85]], 1.4, C.wood.map((v) => v * 0.8), 0.9);
  }
  line(ctx, [[gate[0], y0 - 9 - wallH * 0.6], [gate[1], y0 - 9 - wallH * 0.6]], 1.2, C.wood.map((v) => v * 0.8), 0.9);
  // 墙根一垛柴
  for (let k = 0; k < 7; k++) line(ctx, [[x0 + 14 + k * 3, y0 - 3], [x0 + 22 + k * 3, y0 - 15 + (k % 2) * 2]], 1.6, C.wood.map((v) => v * 0.75), 0.8);
  ctx.restore();
}

// ---------- 夏夜萤火虫（前景白粉层上的小亮点，一明一灭） ----------
export function drawFireflies(F, t, o = {}) {
  const W8 = whiteOf(F);
  if (!W8) return;
  const [x0, y0, x1, y1] = o.region || [800, 600, 1300, 820];
  const n = o.count ?? 18;
  const amt = o.amount ?? 1;
  for (let i = 0; i < n; i++) {
    const h1 = hash(i, 41), h2 = hash(i, 43), h3 = hash(i, 47);
    const x = x0 + h1 * (x1 - x0) + noise1(t * 0.3 + i, 5) * 40;
    const y = y0 + h2 * (y1 - y0) + noise1(t * 0.35 + i, 6) * 26;
    const blink = Math.pow(Math.max(0, Math.sin(t * (1.4 + h3 * 1.2) + i * 2.1)), 3) * amt;
    if (blink < 0.02) continue;
    softDot(F, x, y, 7, [236, 232, 150], 0.25 * blink, 0.4);
    W8.save();
    W8.globalAlpha = 0.95 * blink;
    W8.fillStyle = '#fff';
    W8.beginPath();
    W8.arc(x, y, 1.6, 0, TAU);
    W8.fill();
    W8.restore();
  }
}

// ---------- 雪地脚印：给出每一步的位置（世界坐标）与先后 ----------
export function drawFootprints(F, steps, o = {}) {
  const W8 = whiteOf(F);
  F.save();
  F.globalCompositeOperation = 'multiply';
  steps.forEach((s, i) => {
    const side = i % 2 ? 1 : -1;
    const x = s.x + side * 2.2, y = s.y + side * 0.6;
    const a = (o.alpha ?? 1) * (s.fade ?? 1);
    F.fillStyle = rgba([170, 178, 194], 0.75 * a);
    F.beginPath();
    F.ellipse(x, y, 2.6, 1.1, 0, 0, TAU);
    F.fill();
    if (W8) {
      W8.save();
      W8.globalAlpha = 0.8 * a;
      W8.fillStyle = '#fff';
      W8.beginPath();
      W8.ellipse(x + 0.4, y - 1.1, 2.4, 0.5, 0, 0, TAU);
      W8.fill();
      W8.restore();
    }
  });
  F.restore();
}
