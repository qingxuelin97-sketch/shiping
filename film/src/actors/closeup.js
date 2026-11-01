// 近景专用：手（老人、女人、孩子）、精细的线拐子、磨断的红线。
// 手的局部坐标：原点在腕部，+x 指向指尖，-y 是拇指一侧（mirror 翻转）。
// 手指是三节骨骼，弯曲量 curl 0..1：手背视图里远端折到下面（像握拳的指节），
// 手心视图里远端折到掌心上方（指尖压在掌上）。
import { stroke, rgba, inkRGB, softDot, whiteOf, line } from '../ink/brush.js';
import { clamp, lerp, TAU } from '../core/math.js';
import { noise1, hash } from '../core/noise.js';
import { C } from '../world/palette.js';

export const SKIN = { old: [234, 204, 178], adult: [244, 220, 200], child: [248, 224, 206] };
const SHADE = [212, 160, 140];

function capsule(bones, widths) {
  const L = [], R = [];
  const n = bones.length;
  for (let i = 0; i < n; i++) {
    const a = bones[Math.max(0, i - 1)], b = bones[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    const w = widths[i] / 2;
    L.push([bones[i][0] + nx * w, bones[i][1] + ny * w]);
    R.push([bones[i][0] - nx * w, bones[i][1] - ny * w]);
  }
  const path = new Path2D();
  path.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) path.lineTo(L[i][0], L[i][1]);
  const e = bones[n - 1], p = bones[n - 2];
  const ang = Math.atan2(e[1] - p[1], e[0] - p[0]);
  path.arc(e[0], e[1], widths[n - 1] / 2, ang - Math.PI / 2, ang + Math.PI / 2);
  for (let i = n - 1; i >= 0; i--) path.lineTo(R[i][0], R[i][1]);
  const s0 = bones[0], s1 = bones[1];
  const ang0 = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]);
  path.arc(s0[0], s0[1], widths[0] / 2, ang0 + Math.PI / 2, ang0 + Math.PI * 1.5);
  path.closePath();
  return { path, L, R };
}

function smoothClosed(pts) {
  const p = new Path2D();
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const s0 = m(pts[pts.length - 1], pts[0]);
  p.moveTo(s0[0], s0[1]);
  for (let i = 0; i < pts.length; i++) {
    const e = m(pts[i], pts[(i + 1) % pts.length]);
    p.quadraticCurveTo(pts[i][0], pts[i][1], e[0], e[1]);
  }
  p.closePath();
  return p;
}

// 收集一条闭合平滑曲线上的点（用于描边）
function smoothPts(pts, per = 6) {
  const out = [];
  const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (let i = 0; i < pts.length; i++) {
    const a = m(pts[(i + pts.length - 1) % pts.length], pts[i]), c = pts[i], b = m(pts[i], pts[(i + 1) % pts.length]);
    for (let q = 0; q < per; q++) {
      const t = q / per;
      out.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]]);
    }
  }
  out.push(out[0]);
  return out;
}

// 当前变换下 1 个局部单位等于多少屏幕虚拟像素（线宽按屏幕像素算，放大缩小都合适）
function pxScale(ctx) {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) / (ctx.base || 1);
}

function fill(ctx, path, col, a = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha *= a;
  ctx.fillStyle = rgba(col, 1);
  ctx.fill(path);
  ctx.restore();
  const W = ctx.white;
  if (W) {
    W.setTransform(ctx.getTransform());
    W.save();
    W.globalCompositeOperation = 'destination-out';
    W.globalAlpha = ctx.globalAlpha * a;
    W.fill(path);
    W.restore();
  }
}
function shade(ctx, path, a, b, col, k) {
  ctx.save();
  ctx.clip(path);
  const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
  g.addColorStop(0, rgba(col, 0));
  g.addColorStop(0.55, rgba(col, k * 0.3));
  g.addColorStop(1, rgba(col, k));
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.restore();
}
function ink(ctx, pts, w, o = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  stroke(ctx, pts, { w, tone: o.tone ?? 0.86, alpha: o.alpha ?? 0.9, dry: o.dry ?? 0.12, taperIn: o.ti ?? 0.2, taperOut: o.to ?? 0.3, seed: o.seed ?? 1, wobble: 0.15, fade: 0, body: 1 });
  ctx.restore();
}

/**
 * 画一只手（含手腕与袖口）。
 * o: { x, y 腕部；ang 手指方向；s 掌长(px)；kind 'old'|'adult'|'child'；view 'back'|'palm'；
 *      curl 数或 [食,中,无名,小]；thumb 拇指弯曲 0..1；thumbA 拇指张开角；spread 指缝张开；
 *      mirror 拇指换到另一侧；sleeve 袖子颜色；cuff 袖口颜色；sleeveLen；alpha }
 */
export function drawHand(ctx, o) {
  const kind = o.kind || 'adult';
  const s = o.s;
  const skin = o.skin || SKIN[kind];
  const skinD = skin.map((v) => v * 0.95);
  const view = o.view || 'back';
  const chub = kind === 'child' ? 1.14 : kind === 'old' ? 0.98 : 0.94;
  const flen = kind === 'child' ? 0.76 : kind === 'old' ? 0.98 : 1.0;
  const curl = Array.isArray(o.curl) ? o.curl : [0, 0, 0, 0].map(() => o.curl ?? 0.15);
  const spread = o.spread ?? 1;
  const sc0 = pxScale(ctx);
  const lw = Math.min(6, Math.max(1.1, s * sc0 * 0.03)) / sc0;
  const seed = o.seed ?? 1;
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.ang);
  if (o.mirror) ctx.scale(1, -1);
  ctx.globalAlpha = o.alpha ?? 1;
  const pw = s * 0.86 * chub;
  const only = o.only || null; // 'fingers'：只画手指与拇指（叠在手里握着的东西上面）

  // ---- 四指：沿手指方向的一维投影（弯曲的指节折向画面里/外） ----
  const fingers = [0, 1, 2, 3].map((i) => {
    const base = [s * [0.95, 1.0, 0.96, 0.88][i], [-0.35, -0.115, 0.12, 0.34][i] * pw];
    const L = [0.84, 0.94, 0.88, 0.7][i] * s * flen;
    const segL = [0.46, 0.3, 0.24].map((k) => k * L);
    const dirA = [-0.07, -0.02, 0.03, 0.085][i] * spread + (o.bend ?? 0);
    const w = [0.25, 0.26, 0.245, 0.215][i] * s * chub;
    const cu = clamp(curl[i]);
    const bends = [1.3, 1.6, 1.15].map((k) => k * cu);
    let th = 0, d = 0;
    const xs = [0];
    for (let k = 0; k < 3; k++) {
      th += bends[k];
      d += segL[k] * Math.cos(th);
      xs.push(d);
    }
    const ext = Math.max(xs[1], xs[2], xs[3], segL[0] * 0.3);
    const dir = [Math.cos(dirA), Math.sin(dirA)];
    const P = (dd, lat = 0) => [base[0] + dir[0] * dd - dir[1] * lat, base[1] + dir[1] * dd + dir[0] * lat];
    return { i, base, dir, ext, xs, w, cu, P };
  });
  // 一根“胶囊”的轮廓点：左侧 → 圆头 → 右侧
  const capOutline = (P, d0, d1, w0, w1) => {
    const pts = [];
    for (let k = 0; k <= 3; k++) pts.push(P(lerp(d0, d1, k / 3), lerp(w0, w1, k / 3) / 2));
    for (let k = 1; k < 8; k++) {
      const a = Math.PI / 2 - (k / 8) * Math.PI;
      pts.push(P(d1 + Math.cos(a) * w1 / 2, Math.sin(a) * w1 / 2));
    }
    for (let k = 3; k >= 0; k--) pts.push(P(lerp(d0, d1, k / 3), -lerp(w0, w1, k / 3) / 2));
    return pts;
  };
  const polyPath = (pts) => {
    const p = new Path2D();
    p.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts) p.lineTo(q[0], q[1]);
    p.closePath();
    return p;
  };
  const drawFinger = (f, dark) => {
    const pts = capOutline(f.P, -f.w * 0.4, f.ext, f.w, f.w * (0.86 + f.cu * 0.1));
    const path = polyPath(pts);
    fill(ctx, path, dark ? skinD : skin);
    shade(ctx, path, f.P(f.ext * 0.5, -f.w * 0.5), f.P(f.ext * 0.5, f.w * 0.55), SHADE, 0.3);
    ink(ctx, pts, lw * 0.85, { seed: seed + f.i * 7, ti: 0.25, to: 0.25 });
    // 手心视图：弯过来的指尖压在掌上
    if (view === 'palm' && f.cu > 0.2 && f.xs[3] < f.ext - f.w * 0.35) {
      const d0 = f.ext - f.w * 0.3, d1 = Math.max(f.xs[3], -f.w * 0.2);
      const q = capOutline((dd, lat) => f.P(dd, lat + f.w * 0.06), d1, d0, f.w * 0.78, f.w * 0.86).reverse();
      const pp = polyPath(q);
      fill(ctx, pp, skin.map((v) => Math.min(255, v * 1.02)));
      ink(ctx, q.slice(4), lw * 0.75, { seed: seed + f.i * 7 + 3, ti: 0.3, to: 0.3, alpha: 0.85 });
    }
  };

  if (only === 'fingers') {
    [0, 1, 2, 3].forEach((i) => drawFinger(fingers[i], false));
  }
  // ---- 手腕 ----
  const w0 = o.noWrist ? -s * 0.05 : -s * 0.8;
  const wristPts = only ? null : capOutline((dd, lat) => [dd, lat], w0, s * 0.3, pw * 0.64, pw * 0.72);
  if (!only) {
  fill(ctx, polyPath(wristPts), skin);
  if (!o.noWrist) {
    ink(ctx, [[-s * 0.7, -pw * 0.33], [s * 0.05, -pw * 0.37]], lw * 0.8, { seed: seed + 30 });
    ink(ctx, [[-s * 0.7, pw * 0.33], [s * 0.05, pw * 0.37]], lw * 0.8, { seed: seed + 31 });
  }

  // ---- 掌 ----
  const palmPts = [[s * 0.02, -pw * 0.4], [s * 0.5, -pw * 0.53], [s * 0.93, -pw * 0.5], [s * 1.0, -pw * 0.1], [s * 0.95, pw * 0.42], [s * 0.55, pw * 0.5], [s * 0.02, pw * 0.4]];
  const palm = smoothClosed(palmPts);
  const pp = smoothPts(palmPts);
  const n = pp.length;
  if (view === 'back') {
    [3, 2, 1, 0].forEach((i) => drawFinger(fingers[i], i % 2 === 1));
    fill(ctx, palm, skin);
    shade(ctx, palm, [s * 0.5, -pw * 0.5], [s * 0.5, pw * 0.55], SHADE, 0.34);
    // 掌的两侧描边（指根处不描，手背与手指连成一片）
    ink(ctx, pp.slice(Math.floor(n * 0.04), Math.floor(n * 0.3)), lw, { seed: seed + 40 });
    ink(ctx, pp.slice(Math.floor(n * 0.6), Math.floor(n * 0.86)), lw * 1.1, { seed: seed + 41 });
    // 握拳时凸起的指节
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    fingers.forEach((f) => {
      if (f.cu > 0.45) {
        const b = f.P(-f.w * 0.05);
        softDot(ctx, b[0], b[1], f.w * 0.36, SHADE, 0.35, 0.5);
        line(ctx, [f.P(f.ext - f.w * 0.15, -f.w * 0.3), f.P(f.ext - f.w * 0.05, 0), f.P(f.ext - f.w * 0.15, f.w * 0.3)], lw * 0.5, inkRGB(0.6), 0.45);
      }
    });
    ctx.restore();
  } else {
    fill(ctx, palm, skin);
    shade(ctx, palm, [s * 0.5, pw * 0.5], [s * 0.5, -pw * 0.55], SHADE, 0.2);
    ink(ctx, pp.slice(Math.floor(n * 0.04), Math.floor(n * 0.3)), lw, { seed: seed + 40 });
    ink(ctx, pp.slice(Math.floor(n * 0.6), Math.floor(n * 0.86)), lw * 1.1, { seed: seed + 41 });
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    line(ctx, [[s * 0.22, -pw * 0.32], [s * 0.42, -pw * 0.08], [s * 0.55, pw * 0.3]], lw * 0.55, inkRGB(0.55), 0.4);
    line(ctx, [[s * 0.55, -pw * 0.44], [s * 0.66, -pw * 0.18], [s * 0.84, pw * 0.05]], lw * 0.5, inkRGB(0.55), 0.35);
    ctx.restore();
    [0, 1, 2, 3].forEach((i) => drawFinger(fingers[i], false));
    // 指节横纹
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    fingers.forEach((f) => {
      for (const k of [1, 2]) {
        const dd = f.xs[k];
        if (dd > f.w * 0.3 && dd < f.ext - f.w * 0.3 && f.cu < 0.5) line(ctx, [f.P(dd, -f.w * 0.28), f.P(dd, f.w * 0.28)], lw * 0.4, inkRGB(0.55), 0.35);
      }
    });
    ctx.restore();
  }

  }
  // ---- 拇指 ----
  if (!only || o.thumbOver) {
    const tc = clamp(o.thumb ?? 0.2);
    const a0 = o.thumbA ?? -0.7;
    const b0 = [s * 0.22, -pw * 0.28];
    const l1 = s * 0.44 * flen, l2 = s * 0.34 * flen;
    const d1 = a0 + tc * 0.6, d2 = d1 + 0.12 + tc * 0.8;
    const j1 = [b0[0] + Math.cos(d1) * l1, b0[1] + Math.sin(d1) * l1];
    const tip = [j1[0] + Math.cos(d2) * l2, j1[1] + Math.sin(d2) * l2];
    const tw = s * 0.27 * chub;
    // 两段胶囊拼成的轮廓
    const n1 = [-Math.sin(d1), Math.cos(d1)], n2 = [-Math.sin(d2), Math.cos(d2)];
    const side = (sg) => [
      [b0[0] + n1[0] * tw * 0.62 * sg, b0[1] + n1[1] * tw * 0.62 * sg],
      [j1[0] + (n1[0] + n2[0]) * 0.5 * tw * 0.5 * sg, j1[1] + (n1[1] + n2[1]) * 0.5 * tw * 0.5 * sg],
      [tip[0] + n2[0] * tw * 0.4 * sg, tip[1] + n2[1] * tw * 0.4 * sg],
    ];
    const Ls = side(1), Rs = side(-1);
    const arc = [];
    for (let k = 1; k < 8; k++) {
      const a = d2 + Math.PI / 2 - (k / 8) * Math.PI;
      arc.push([tip[0] + Math.cos(a) * tw * 0.4, tip[1] + Math.sin(a) * tw * 0.4]);
    }
    const outline = [...Ls, ...arc, ...Rs.reverse()];
    const tp = polyPath(outline);
    fill(ctx, tp, skin);
    shade(ctx, tp, Ls[1], Rs[1], SHADE, 0.28);
    ink(ctx, outline.slice(1), lw * 0.9, { seed: seed + 50, ti: 0.3, to: 0.2 });
    if (view === 'back' && tc < 0.75) nailAt(ctx, [tip[0] - Math.cos(d2) * s * 0.07, tip[1] - Math.sin(d2) * s * 0.07], d2, s * 0.13, tw * 0.5, lw);
    if (kind === 'old') line(ctx, [[j1[0] - s * 0.04, j1[1] - s * 0.04], [j1[0] + s * 0.03, j1[1] + s * 0.03]], lw * 0.45, inkRGB(0.55), 0.4);
  }

  // ---- 手背细节：指甲、皱纹、青筋、老人斑 ----
  if (view === 'back' && !only) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    fingers.forEach((f) => {
      if (f.cu < 0.35) {
        ctx.restore();
        nailAt(ctx, f.P(f.ext - s * 0.07), Math.atan2(f.dir[1], f.dir[0]), s * 0.12, f.w * 0.58, lw);
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
      }
      if (kind === 'old' && f.cu < 0.6) {
        const dd = f.xs[1];
        if (dd < f.ext - f.w * 0.3) for (const q of [-1, 0, 1]) line(ctx, [f.P(dd + q * s * 0.02 - s * 0.012, -f.w * 0.26), f.P(dd + q * s * 0.02 + s * 0.01, 0), f.P(dd + q * s * 0.02 - s * 0.012, f.w * 0.26)], lw * 0.38, inkRGB(0.55), 0.38);
      }
    });
    if (kind === 'old') {
      line(ctx, [[s * 0.05, -pw * 0.05], [s * 0.35, -pw * 0.12], [s * 0.62, -pw * 0.08], [s * 0.86, -pw * 0.22]], lw * 0.6, [150, 160, 178], 0.35);
      line(ctx, [[s * 0.12, pw * 0.08], [s * 0.42, pw * 0.1], [s * 0.7, pw * 0.2]], lw * 0.5, [150, 160, 178], 0.28);
      for (let k = 0; k < 5; k++) softDot(ctx, s * (0.3 + hash(k, seed) * 0.55), pw * (hash(k, seed + 3) - 0.5) * 0.7, s * (0.022 + hash(k, 9) * 0.018), [176, 134, 100], 0.38, 0.6);
      line(ctx, [[-s * 0.05, -pw * 0.25], [-s * 0.02, 0], [-s * 0.05, pw * 0.25]], lw * 0.4, inkRGB(0.55), 0.3);
    }
    ctx.restore();
  }

  // ---- 袖子：平口，盖住手腕 ----
  if (o.sleeve && !only) {
    const sl = o.sleeveLen ?? s * 4;
    const sw = (o.sleeveW ?? pw * 1.22) / 2;
    const x1 = -s * 0.32, xc = x1 - s * 0.42;
    const body = new Path2D();
    body.moveTo(-sl, -sw * 1.06);
    body.lineTo(x1, -sw);
    body.quadraticCurveTo(x1 + s * 0.08, 0, x1, sw);
    body.lineTo(-sl, sw * 1.06);
    body.closePath();
    fill(ctx, body, o.sleeve);
    shade(ctx, body, [x1 - s, -sw], [x1 - s, sw], [118, 124, 142], 0.42);
    const cuffC = o.cuff || o.sleeve.map((v) => Math.min(255, v + 40));
    const cp = new Path2D();
    cp.moveTo(xc, -sw * 1.01);
    cp.lineTo(x1, -sw);
    cp.quadraticCurveTo(x1 + s * 0.08, 0, x1, sw);
    cp.lineTo(xc, sw * 1.01);
    cp.quadraticCurveTo(xc + s * 0.08, 0, xc, -sw * 1.01);
    cp.closePath();
    fill(ctx, cp, cuffC);
    shade(ctx, cp, [xc, -sw], [xc, sw], [118, 124, 142], 0.3);
    ink(ctx, [[-sl, -sw * 1.06], [x1, -sw]], lw * 1.3, { seed: seed + 61, ti: 0.05, to: 0.05 });
    ink(ctx, [[-sl, sw * 1.06], [x1, sw]], lw * 1.5, { seed: seed + 62, ti: 0.05, to: 0.05 });
    ink(ctx, [[x1, -sw], [x1 + s * 0.04, -sw * 0.5], [x1 + s * 0.04, sw * 0.5], [x1, sw]], lw, { seed: seed + 63, ti: 0.1, to: 0.1 });
    ink(ctx, [[xc, -sw], [xc + s * 0.04, 0], [xc, sw]], lw * 0.6, { seed: seed + 64, alpha: 0.55 });
    // 袖褶（只画在袖子范围内）
    const fx = (k) => Math.max(-sl + s * 0.2, x1 - s * k);
    if (sl > s * 1.4) ink(ctx, [[fx(1.6), -sw * 0.55], [fx(1.1), -sw * 0.25]], lw * 0.6, { seed: seed + 65, alpha: 0.45, dry: 0.4 });
    if (sl > s * 2.1) ink(ctx, [[fx(2.3), sw * 0.45], [fx(1.7), sw * 0.15]], lw * 0.6, { seed: seed + 66, alpha: 0.4, dry: 0.4 });
  }
  ctx.restore();
}

function nailAt(ctx, c, ang, l, w, lw) {
  ctx.save();
  ctx.translate(c[0], c[1]);
  ctx.rotate(ang);
  const p = new Path2D();
  p.ellipse(0, 0, l * 0.5, w * 0.5, 0, 0, TAU);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = rgba([250, 236, 226], 0.9);
  ctx.fill(p);
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = rgba(inkRGB(0.6), 0.55);
  ctx.lineWidth = lw * 0.45;
  ctx.stroke(p);
  ctx.restore();
}

// ---------- 精细的线拐子 ----------
// s：竖梁半长。thread 0..1 线的多少；snow 0..1 积雪；tail(t) 线头
export function drawReelHi(ctx, x, y, s, rot = 0, o = {}) {
  const wood = C.wood;
  const woodD = wood.map((v) => v * 0.7);
  const sc0 = pxScale(ctx);
  const lw = Math.min(6, Math.max(1.1, s * sc0 * 0.035)) / sc0;
  const thread = o.thread ?? 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = o.alpha ?? 1;
  const gap = s * 0.62; // 两梁之间的半宽
  const bw = s * 0.17; // 梁宽
  // 横轴
  const ax = new Path2D();
  ax.rect(-gap - bw * 0.3, -s * 0.07, (gap + bw * 0.3) * 2, s * 0.14);
  fill(ctx, ax, woodD);
  // 缠满的红线：两头收、中间鼓
  if (thread > 0) {
    const hh = s * 0.6 * thread;
    const sp = new Path2D();
    sp.moveTo(-gap, -hh * 0.82);
    sp.quadraticCurveTo(0, -hh * 1.12, gap, -hh * 0.82);
    sp.lineTo(gap, hh * 0.82);
    sp.quadraticCurveTo(0, hh * 1.12, -gap, hh * 0.82);
    sp.closePath();
    fill(ctx, sp, C.vermilion);
    shade(ctx, sp, [0, -hh], [0, hh * 1.1], [150, 40, 40], 0.5);
    ctx.save();
    ctx.clip(sp);
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = rgba([140, 34, 26], 0.55);
    ctx.lineWidth = lw * 0.45;
    const n = Math.round(10 + thread * 16);
    for (let k = 0; k <= n; k++) {
      const yy = lerp(-hh * 1.1, hh * 1.1, k / n);
      ctx.beginPath();
      ctx.moveTo(-gap, yy - s * 0.04);
      ctx.quadraticCurveTo(0, yy + s * 0.05, gap, yy + s * 0.02);
      ctx.stroke();
    }
    ctx.restore();
    const W = whiteOf(ctx);
    if (W) {
      W.save();
      W.globalAlpha = ctx.globalAlpha * 0.4;
      W.strokeStyle = '#fff';
      W.lineWidth = s * 0.06;
      W.lineCap = 'round';
      W.beginPath();
      W.moveTo(-gap * 0.7, -hh * 0.55);
      W.quadraticCurveTo(0, -hh * 0.78, gap * 0.6, -hh * 0.55);
      W.stroke();
      W.restore();
    }
    ink(ctx, [[-gap, -hh * 0.82], [0, -hh * 0.97], [gap, -hh * 0.82]], lw * 0.7, { seed: 701, tone: 0.7, alpha: 0.7 });
    ink(ctx, [[-gap, hh * 0.82], [0, hh * 0.97], [gap, hh * 0.82]], lw * 0.8, { seed: 702, tone: 0.7, alpha: 0.75 });
  }
  // 两根竖梁
  for (const sx of [-1, 1]) {
    const cx = sx * (gap + bw * 0.5);
    const bar = new Path2D();
    bar.roundRect(cx - bw / 2, -s, bw, s * 2, bw * 0.45);
    fill(ctx, bar, wood);
    shade(ctx, bar, [cx - bw / 2, 0], [cx + bw / 2, 0], [120, 90, 60], 0.45);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    // 木纹
    for (let k = 0; k < 3; k++) {
      const gx = cx - bw * 0.25 + k * bw * 0.22;
      line(ctx, [[gx, -s * 0.9], [gx + noise1(k, 3) * bw * 0.1, -s * 0.2], [gx - noise1(k, 5) * bw * 0.1, s * 0.5], [gx, s * 0.9]], lw * 0.35, [110, 80, 56], 0.4);
    }
    ctx.restore();
    ink(ctx, [[cx - bw / 2, -s * 0.9], [cx - bw / 2, s * 0.9]], lw, { seed: 710 + sx, tone: 0.8 });
    ink(ctx, [[cx + bw / 2, -s * 0.9], [cx + bw / 2, s * 0.9]], lw * 1.2, { seed: 712 + sx, tone: 0.85 });
    ink(ctx, [[cx - bw / 2, -s * 0.92], [cx, -s * 1.0], [cx + bw / 2, -s * 0.92]], lw * 0.9, { seed: 714 + sx, tone: 0.8 });
    ink(ctx, [[cx - bw / 2, s * 0.92], [cx, s * 1.0], [cx + bw / 2, s * 0.92]], lw * 0.9, { seed: 716 + sx, tone: 0.8 });
  }
  // 积雪
  if (o.snow > 0) {
    const W = whiteOf(ctx);
    if (W) {
      W.save();
      W.globalAlpha = ctx.globalAlpha * clamp(o.snow);
      W.fillStyle = 'rgba(255,255,255,0.95)';
      for (const sx of [-1, 1]) {
        const cx = sx * (gap + bw * 0.5);
        W.beginPath();
        W.ellipse(cx, -s * 0.98, bw * 0.75, s * 0.08, 0, Math.PI, TAU);
        W.fill();
      }
      const hh = s * 0.6 * thread;
      W.beginPath();
      W.moveTo(-gap, -hh * 0.82);
      W.quadraticCurveTo(0, -hh * 1.12 - s * 0.16 * o.snow, gap, -hh * 0.82);
      W.quadraticCurveTo(0, -hh * 0.98, -gap, -hh * 0.82);
      W.fill();
      W.restore();
    }
  }
  ctx.restore();
}

// ---------- 磨断的红线（慢镜头） ----------
// a、b 为线的两端（屏幕坐标）；k 为断裂进度：0 完好，0..1 纤维一根根断，>1 断开后的回弹时间（秒）
export function drawFrayString(ctx, a, b, o = {}) {
  const t = o.t ?? 0;
  const w = o.w ?? 12;
  const fray = o.fray ?? 0; // 0..1：纤维断了多少
  const after = o.after ?? -1; // 断开后的秒数（<0 未断）
  const at = o.at ?? 0.5; // 断点位置
  const vib = o.vib ?? 1;
  const N = 4; // 纤维数
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const P = (s, off) => [a[0] + ux * s * L + nx * off, a[1] + uy * s * L + ny * off];
  // 绷紧时的颤动：一阶驻波
  const amp = (s) => Math.sin(s * Math.PI) * Math.sin(t * 38) * w * 0.18 * vib;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const red = C.vermilion;
  const darkRed = [140, 34, 26];
  const rope = (pts, ww, col = red, al = 1) => {
    ctx.strokeStyle = rgba(col, al);
    ctx.lineWidth = ww;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  };
  // 一段完整的绳：带斜向的绞纹
  const twisted = (pts, ww) => {
    rope(pts, ww);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1], p1 = pts[i];
      const sl = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const ex = (p1[0] - p0[0]) / (sl || 1), ey = (p1[1] - p0[1]) / (sl || 1);
      const qx = -ey, qy = ex;
      while (acc < sl) {
        const c = [p0[0] + ex * acc, p0[1] + ey * acc];
        ctx.strokeStyle = rgba(darkRed, 0.55);
        ctx.lineWidth = Math.max(1, ww * 0.12);
        ctx.beginPath();
        ctx.moveTo(c[0] + qx * ww * 0.45 - ex * ww * 0.25, c[1] + qy * ww * 0.45 - ey * ww * 0.25);
        ctx.lineTo(c[0] - qx * ww * 0.45 + ex * ww * 0.25, c[1] - qy * ww * 0.45 + ey * ww * 0.25);
        ctx.stroke();
        acc += ww * 0.55;
      }
      acc -= sl;
    }
    ctx.restore();
    const W = whiteOf(ctx);
    if (W) {
      W.save();
      W.globalAlpha = 0.28;
      W.strokeStyle = '#fff';
      W.lineWidth = ww * 0.18;
      W.lineCap = 'round';
      W.beginPath();
      W.moveTo(pts[0][0] - nx * ww * 0.22, pts[0][1] - ny * ww * 0.22);
      for (let i = 1; i < pts.length; i++) W.lineTo(pts[i][0] - nx * ww * 0.22, pts[i][1] - ny * ww * 0.22);
      W.stroke();
      W.restore();
    }
  };
  const seg = (s0, s1, n = 24, extra = () => [0, 0]) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const s = lerp(s0, s1, i / n);
      const e = extra(s);
      const q = P(s, amp(s) + e[1]);
      out.push([q[0] + ux * e[0], q[1] + uy * e[0]]);
    }
    return out;
  };
  const gapL = 0.06; // 断点附近散开的纤维段长度（占全长）
  if (after < 0) {
    // 未断：两段完整的绳 + 中间散开的纤维
    twisted(seg(0, at - gapL), w);
    twisted(seg(at + gapL, 1), w);
    for (let f = 0; f < N; f++) {
      const off = (f - (N - 1) / 2) * w * 0.26;
      const broken = fray * N > f + 0.5;
      const bulge = (s) => {
        const q = clamp(1 - Math.abs(s - at) / gapL);
        return [0, off * (1 - q) + off * q * (1 + fray * 2.2)];
      };
      if (!broken) rope(seg(at - gapL - 0.005, at + gapL + 0.005, 12, bulge), w * 0.22);
      else {
        // 断掉的纤维：两头各自卷曲回缩
        const bt = clamp(fray * N - f - 0.5) * 2;
        const curl = (side) => {
          const pts = [];
          const s0 = side < 0 ? at - gapL : at + gapL;
          const base = P(s0, off + amp(s0));
          pts.push(base);
          const len = w * (1.6 - bt * 0.6);
          for (let k = 1; k <= 8; k++) {
            const q = k / 8;
            const ang = Math.atan2(uy, ux) * 1 + (side < 0 ? 0 : Math.PI) + (f % 2 ? 1 : -1) * q * (1.2 + bt * 2.5);
            const pr = pts[pts.length - 1];
            pts.push([pr[0] + Math.cos(ang) * len / 8, pr[1] + Math.sin(ang) * len / 8]);
          }
          return pts;
        };
        rope(curl(-1), w * 0.2);
        rope(curl(1), w * 0.2);
      }
    }
  } else {
    // 断开：上段（到风筝那头）甩出画面，下段回弹卷曲
    const k = after;
    const up = (s) => {
      // s ∈ [at, 1]：往 b 方向飞走，靠断头一侧甩出 S 形
      const q = (s - at) / (1 - at);
      const whip = Math.sin(q * 5 - k * 9) * w * 4 * (1 - q) * Math.min(1, k * 3);
      return [k * L * 0.9 * (0.4 + 0.6 * (1 - q) * 0 + 0.6), whip];
    };
    const dn = (s) => {
      const q = (at - s) / at;
      const coil = Math.sin(q * 7 + k * 7) * w * 3.5 * (1 - q) * Math.min(1, k * 2.5);
      return [-k * L * 0.35 * (1 - q) - k * L * 0.12, coil + k * k * w * 6 * (1 - q)];
    };
    twisted(seg(at + 0.01, 1, 32, up), w);
    twisted(seg(0, at - 0.01, 32, dn), w);
    // 散落的纤维碎屑
    for (let f = 0; f < 7; f++) {
      const p0 = P(at, 0);
      const ang = hash(f, 7) * TAU;
      const r = k * (60 + hash(f, 3) * 140);
      const c = [p0[0] + Math.cos(ang) * r, p0[1] + Math.sin(ang) * r + k * k * 40];
      ctx.globalAlpha = clamp(1 - k * 0.6);
      rope([c, [c[0] + Math.cos(ang + k * 3) * w * 0.8, c[1] + Math.sin(ang + k * 3) * w * 0.8]], w * 0.12);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

// ---------- 近景白菊 ----------
export function drawMum(ctx, x, y, s, rot = 0, o = {}) {
  const W = whiteOf(ctx);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  // 茎与叶
  const stem = [[0, 0], [s * 0.4, s * 0.9], [s * 0.7, s * 2.2]];
  ink(ctx, stem, s * 0.09, { tone: 0.6, alpha: 0.9, seed: 801 });
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (const [lx, ly, la] of [[s * 0.42, s * 1.0, 0.9], [s * 0.6, s * 1.6, -0.6]]) {
    ctx.fillStyle = rgba([138, 156, 128], 0.95);
    ctx.beginPath();
    ctx.ellipse(lx + Math.cos(la) * s * 0.3, ly + Math.sin(la) * s * 0.3, s * 0.34, s * 0.13, la, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
  // 花瓣：三圈细长瓣（白粉）+ 灰色瓣线
  const rings = [[1.0, 22, 0.13], [0.78, 18, 0.12], [0.55, 14, 0.11]];
  const petal = (c, k, j, R0, wd, fillIt) => {
    const a = (j / k) * TAU + R0 * 3 + hash(j, k) * 0.15;
    const len = s * R0 * (0.9 + hash(j, 3) * 0.2);
    const cx = Math.cos(a) * len * 0.52, cy = Math.sin(a) * len * 0.52 * (o.squash ?? 0.75);
    c.beginPath();
    c.ellipse(cx, cy, len * 0.5, s * wd * 0.5, Math.atan2(Math.sin(a) * (o.squash ?? 0.75), Math.cos(a)), 0, TAU);
    if (fillIt) c.fill(); else c.stroke();
  };
  if (W) {
    W.save();
    W.setTransform(ctx.getTransform());
    W.translate(x, y);
    W.rotate(rot);
    W.globalAlpha = o.alpha ?? 1;
    W.fillStyle = 'rgba(255,255,255,0.96)';
    for (const [R0, k, wd] of rings) for (let j = 0; j < k; j++) petal(W, k, j, R0, wd, true);
    W.restore();
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = rgba(inkRGB(0.5), 0.6);
  ctx.lineWidth = Math.max(0.8, s * 0.014);
  for (const [R0, k, wd] of rings) for (let j = 0; j < k; j++) petal(ctx, k, j, R0, wd, false);
  ctx.fillStyle = rgba([222, 204, 140], 0.9);
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.16, s * 0.12, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}
