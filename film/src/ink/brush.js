// 笔触库：在“白底”上画墨（白色 = 纸，最终会乘上宣纸纹理）。
// 所有函数都在当前 ctx 变换（世界坐标）下工作。
import { clamp, lerp, TAU, resample, dist } from '../core/math.js';
import { noise1, noise2, hash, Rng } from '../core/noise.js';

export const INK = [24, 22, 21];       // 焦墨
export const VERMILION = [196, 52, 38]; // 朱红：红线、红头绳、印章
export const WHITE = [255, 255, 255];

// tone: 0 = 纸白，1 = 焦墨
export function inkRGB(tone) {
  return [lerp(255, INK[0], tone), lerp(255, INK[1], tone), lerp(255, INK[2], tone)];
}
export function rgba(c, a = 1) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;
}
export function ink(tone, a = 1) {
  return rgba(inkRGB(tone), a);
}
// 带色相的淡彩：c 为纯色，amt 为浓度（0 = 白）
export function tint(c, amt, a = 1) {
  return rgba([lerp(255, c[0], amt), lerp(255, c[1], amt), lerp(255, c[2], amt)], a);
}

// 白粉层：比纸更白的颜料（雪、梨花、高光）。返回与 ctx 同变换的白粉画布上下文
export function whiteOf(ctx) {
  const w = ctx.white;
  if (!w) return null;
  w.setTransform(ctx.getTransform());
  w.globalAlpha = ctx.globalAlpha;
  w.globalCompositeOperation = 'source-over';
  w.filter = ctx.filter;
  return w;
}

// 前景层（人物、道具）：与 ctx 同变换。没有前景层时退回 ctx 本身。
export function fgOf(ctx) {
  const f = ctx.fg;
  if (!f || f === ctx) return ctx;
  f.setTransform(ctx.getTransform());
  f.globalAlpha = 1;
  f.globalCompositeOperation = 'source-over';
  f.filter = 'none';
  return f;
}
// 背景层（接触影等）：与 ctx 同变换
export function bgOf(ctx) {
  const b = ctx.bg;
  if (!b || b === ctx) return ctx;
  b.setTransform(ctx.getTransform());
  b.globalAlpha = 1;
  b.globalCompositeOperation = 'source-over';
  b.filter = 'none';
  return b;
}

// 统一的墨色混合：墨用 multiply 叠加，越叠越深
export function inkMode(ctx) { ctx.globalCompositeOperation = 'multiply'; }
export function normalMode(ctx) { ctx.globalCompositeOperation = 'source-over'; }

function widthAt(o, s) {
  const w = typeof o.w === 'function' ? o.w(s) : o.w;
  const ti = o.taperIn ?? 0.15, to = o.taperOut ?? 0.3;
  let k = 1;
  if (ti > 0 && s < ti) k *= Math.sin((s / ti) * Math.PI / 2) * 0.85 + 0.15;
  if (to > 0 && s > 1 - to) k *= Math.pow(clamp((1 - s) / to), 0.7) * 0.9 + 0.1;
  return w * k;
}

// 计算带法线的采样点
function frame(pts, spacing) {
  const P = resample(pts, spacing);
  const n = P.length;
  const N = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, n - 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    N[i] = [-dy / l, dx / l];
  }
  let L = 0;
  const S = [0];
  for (let i = 1; i < n; i++) { L += dist(P[i - 1], P[i]); S.push(L); }
  for (let i = 0; i < n; i++) S[i] = L > 0 ? S[i] / L : 0;
  return { P, N, S, L };
}

/**
 * 毛笔一笔：由许多“笔毛”细线组成。墨足时笔毛连成实心，墨渐干时笔毛按各自的
 * 墨量依次断开，露出顺着笔势的白丝（飞白）。
 * o: { w 宽度(数或函数 s→宽), tone 墨色, alpha, dry 0..1 干湿, seed, bristles 笔毛数,
 *      taperIn/taperOut 起收锋比例, color 覆盖颜色[r,g,b], body 墨身(湿笔底色)浓度, wobble 边缘起伏 }
 */
export function stroke(ctx, pts, o = {}) {
  if (!pts || pts.length < 2) return;
  const w0 = typeof o.w === 'function' ? o.w(0.5) : (o.w ?? 6);
  const spacing = clamp(w0 * 0.3, 0.6, 5);
  const { P, N, S, L } = frame(pts, spacing);
  if (P.length < 2 || L < 0.5) return;
  const seed = o.seed ?? 1;
  const tone = o.tone ?? 0.9;
  const alpha = o.alpha ?? 1;
  const color = o.color || inkRGB(tone);
  const dry = o.dry ?? 0.25;
  const wob = o.wobble ?? 0.12;
  const fade = o.fade ?? 0.25;

  // 细线：直接画一条变宽条带
  const body = o.body ?? (w0 < 5 ? 1 : 0.55 * (1 - dry));
  if (body > 0.01) {
    const left = [], right = [];
    for (let i = 0; i < P.length; i++) {
      const s = S[i];
      const hw = widthAt(o, s) * 0.5 * (w0 < 5 ? 1 : 0.92);
      const e1 = 1 + wob * noise1(s * L * 0.02, seed * 3.1);
      const e2 = 1 + wob * noise1(s * L * 0.02, seed * 3.1 + 9);
      left.push([P[i][0] + N[i][0] * hw * e1, P[i][1] + N[i][1] * hw * e1]);
      right.push([P[i][0] - N[i][0] * hw * e2, P[i][1] - N[i][1] * hw * e2]);
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i][0], left[i][1]);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    if (fade > 0 && L > 20) {
      const g = ctx.createLinearGradient(P[0][0], P[0][1], P[P.length - 1][0], P[P.length - 1][1]);
      g.addColorStop(0, rgba(color, alpha * body));
      g.addColorStop(1, rgba(color, alpha * body * (1 - fade)));
      ctx.fillStyle = g;
    } else ctx.fillStyle = rgba(color, alpha * body);
    ctx.fill();
  }
  if (w0 < 5 && !o.bristles) return;

  // 笔毛
  const nb = o.bristles ?? Math.round(clamp(w0 / 1.6, 4, 40));
  const rng = new Rng(seed * 13 + 7);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let k = 0; k < nb; k++) {
    const u = ((k + 0.5) / nb) * 2 - 1 + rng.range(-0.6, 0.6) / nb;
    const edge = Math.abs(u);
    const bw = Math.max(0.6, (w0 / nb) * rng.range(1.3, 2.1));
    const ba = alpha * rng.range(0.45, 0.8);
    // 每根笔毛的墨量：越靠笔锋边缘、越往后越少
    const load = rng.range(0.75, 1.25) * (1 - edge * 0.45);
    const kseed = seed * 1.7 + k * 3.91;
    ctx.lineWidth = bw;
    ctx.strokeStyle = rgba(color, ba);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < P.length; i++) {
      const s = S[i];
      const hw = widthAt(o, s) * 0.5;
      const lowN = noise2(s * L * 0.0045 + k * 0.37, kseed) * 0.5 + 0.5;
      const hiN = noise2(s * L * 0.02 + k * 1.3, kseed + 11) * 0.5 + 0.5;
      const inkLeft = load - dry * (0.25 + s * 1.1) * (0.6 + lowN * 0.8) - hiN * dry * 0.18;
      const on = inkLeft > 0.12;
      const uu = u + (o.wave ?? 0.07) * noise2(s * L * 0.012 + k * 0.53, kseed + 23);
      const x = P[i][0] + N[i][0] * hw * uu, y = P[i][1] + N[i][1] * hw * uu;
      if (on) {
        if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
      } else pen = false;
    }
    ctx.stroke();
  }
}

// 不规则墨点（点苔、点叶、花蕊）
export function blob(ctx, x, y, r, o = {}) {
  const seed = o.seed ?? hash(x, y);
  const n = o.sides ?? Math.max(7, Math.min(28, Math.round(r * 1.2)));
  const amp = o.rough ?? 0.22;
  const sx = o.sx ?? 1, sy = o.sy ?? 1, ang = o.angle ?? 0;
  const c = Math.cos(ang), s = Math.sin(ang);
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const rr = r * (1 + amp * noise2(Math.cos(a) * 1.3 + seed * 17, Math.sin(a) * 1.3 + seed * 5));
    const px = Math.cos(a) * rr * sx, py = Math.sin(a) * rr * sy;
    const X = x + px * c - py * s, Y = y + px * s + py * c;
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
  }
  ctx.closePath();
  ctx.fillStyle = o.fill || ink(o.tone ?? 0.85, o.alpha ?? 1);
  ctx.fill();
}

// 柔和晕染（径向渐变）
export function softDot(ctx, x, y, r, fill, alpha = 1, sy = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, sy);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, rgba(fill, alpha));
  g.addColorStop(0.55, rgba(fill, alpha * 0.55));
  g.addColorStop(1, rgba(fill, 0));
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

// 闭合形状填墨，边缘略粗糙
export function fillShape(ctx, pts, fill, o = {}) {
  const seed = o.seed ?? 3;
  const rough = o.rough ?? 0;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    let [x, y] = pts[i];
    if (rough) {
      x += noise2(x * 0.05, seed + y * 0.05) * rough;
      y += noise2(y * 0.05, seed * 2 + x * 0.05) * rough;
    }
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// 一条细线（用于勾勒、人物五官）
export function line(ctx, pts, w, color, alpha = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = typeof color === 'string' ? color : rgba(color, alpha);
  ctx.stroke();
}

// 用 ctx.filter 做模糊绘制
export function blurred(ctx, px, fn) {
  if (px <= 0.3) { fn(); return; }
  ctx.save();
  const m = ctx.getTransform();
  const sc = Math.hypot(m.a, m.b);
  ctx.filter = `blur(${(px * sc).toFixed(2)}px)`;
  fn();
  ctx.restore();
}
