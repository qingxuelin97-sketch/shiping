// 道具：沙燕风筝、红线、线拐子、小木凳、燕子
import { stroke, blob, rgba, inkRGB, softDot, whiteOf, line } from '../ink/brush.js';
import { lerp, clamp, TAU, quadPt, smoothstep, prog, along } from '../core/math.js';
import { noise1, hash } from '../core/noise.js';
import { C } from '../world/palette.js';

// ---------- 沙燕风筝 ----------
// 局部坐标：翼展 = 2（-1..1），头在上（-y），尾尖在 y≈1。
function mirror(half) {
  // half: 左半边从头顶到尾凹（x<=0），镜像出完整闭合轮廓
  const right = half.slice().reverse().map(([x, y]) => [-x, y]);
  return [...half, ...right.slice(1)];
}
const KITE = {
  head: [0, -0.55],
  headR: 0.2,
  outline: mirror([
    [0, -0.76], [-0.12, -0.72], [-0.2, -0.62], [-0.45, -0.6], [-0.75, -0.55], [-0.97, -0.47], [-1.0, -0.38],
    [-0.9, -0.28], [-0.68, -0.18], [-0.42, -0.1], [-0.24, -0.02], [-0.22, 0.2], [-0.3, 0.55], [-0.42, 1.0], [-0.2, 0.8], [0, 0.6],
  ]),
  wingBand: [[-0.2, -0.62], [-0.45, -0.6], [-0.75, -0.55], [-0.97, -0.47], [-1.0, -0.38], [-0.9, -0.33], [-0.68, -0.36], [-0.42, -0.38], [-0.22, -0.4]],
  tail: [[-0.23, 0.32], [-0.3, 0.55], [-0.42, 1.0], [-0.2, 0.8], [0, 0.6], [0.2, 0.8], [0.42, 1.0], [0.3, 0.55], [0.23, 0.32], [0, 0.42]],
  frame: [
    [[-1.0, -0.4], [-0.6, -0.58], [-0.25, -0.62], [0, -0.62], [0.25, -0.62], [0.6, -0.58], [1.0, -0.4]],
    [[0, -0.76], [0, -0.2], [0, 0.6]],
    [[-0.7, -0.2], [-0.35, -0.12], [0, -0.1], [0.35, -0.12], [0.7, -0.2]],
    [[-0.22, 0.0], [-0.3, 0.5], [-0.42, 1.0]],
    [[0.22, 0.0], [0.3, 0.5], [0.42, 1.0]],
  ],
};

function tr(o, p) {
  const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0);
  const x = p[0] * o.size * (o.sx ?? 1), y = p[1] * o.size;
  return [o.x + x * c - y * s, o.y + x * s + y * c];
}
function poly(pts) {
  const p = new Path2D();
  pts.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])));
  p.closePath();
  return p;
}

/**
 * 画沙燕风筝。o: { x, y, size(半翼展), rot, sx(左右翻转/透视压缩),
 *   frame 0..1 只画竹骨, paper 0..1 糊纸, paint 0..1 上色进度, aged 0..1 褪色, patch 0..1 补丁, patchPaint, torn, alpha, lineW }
 */
export function drawKite(ctx, o) {
  const a = o.alpha ?? 1;
  const paint = o.paint ?? 1;
  const aged = o.aged ?? 0;
  const paper = o.paper ?? 1;
  const W8 = whiteOf(ctx);
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.rot || 0);
  ctx.scale(o.size * (o.sx ?? 1), o.size);
  if (W8) W8.setTransform(ctx.getTransform());
  const lw = (o.lineW ?? 1.6) / o.size;
  const body = poly(KITE.outline);
  const headP = new Path2D();
  headP.arc(KITE.head[0], KITE.head[1], KITE.headR, 0, TAU);

  // 竹骨
  const fr = o.frame ?? 1;
  if (fr > 0 && paper < 1) {
    ctx.globalCompositeOperation = 'multiply';
    KITE.frame.forEach((seg, i) => {
      const k = clamp(fr * KITE.frame.length - i);
      if (k <= 0) return;
      const n = Math.max(2, Math.ceil(seg.length * k));
      const part = seg.slice(0, n);
      if (k < 1) {
        const last = seg[n - 1], prev = seg[n - 2] || seg[0];
        const f = k * (seg.length - 1) - (n - 2);
        part[n - 1] = [lerp(prev[0], last[0], clamp(f)), lerp(prev[1], last[1], clamp(f))];
      }
      stroke(ctx, part, { w: lw * 1.8, color: C.bamboo.map((v) => v * 0.8), alpha: 0.95 * a * (1 - paper * 0.6), dry: 0.1, body: 1, taperIn: 0, taperOut: 0, seed: 200 + i });
    });
  }
  if (paper <= 0 && !o.overpaint) { ctx.restore(); return; }

  // 纸面：纸色 + 白粉
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = a * paper;
  ctx.fillStyle = rgba([lerp(250, 238, aged), lerp(248, 228, aged), lerp(244, 204, aged)], 1);
  if (!o.overpaint) { ctx.fill(body); ctx.fill(headP); }
  if (W8 && !o.overpaint) {
    W8.save();
    W8.globalCompositeOperation = 'source-over';
    W8.globalAlpha = a * paper * (0.6 - aged * 0.45);
    W8.fillStyle = '#fff';
    W8.fill(body);
    W8.fill(headP);
    W8.restore();
  }
  ctx.globalAlpha = a;

  // 上色：墨与朱红，同时擦掉其下的白粉
  const fade = 1 - aged * 0.5;
  const blackC = inkRGB(0.95 - aged * 0.35);
  const redC = C.vermilion.map((v, i) => lerp(v, [216, 176, 156][i], aged * 0.8));
  const paintPath = (path, col, al = 1, k = 1) => {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a * k * al;
    ctx.fillStyle = rgba(col, 1);
    ctx.fill(path);
    ctx.restore();
    if (W8) {
      W8.save();
      W8.globalCompositeOperation = 'destination-out';
      W8.globalAlpha = a * k * al;
      W8.fill(path);
      W8.restore();
    }
  };
  const circ = (x, y, r) => { const p = new Path2D(); p.arc(x, y, r, 0, TAU); return p; };
  const steps = [
    (k) => { paintPath(poly(KITE.wingBand), blackC, 0.95 * fade, k); paintPath(poly(KITE.wingBand.map(([x, y]) => [-x, y])), blackC, 0.95 * fade, k); },
    (k) => {
      const cap = new Path2D(); cap.arc(0, -0.55, 0.2, Math.PI * 0.95, Math.PI * 2.05); cap.closePath();
      paintPath(cap, blackC, 0.95 * fade, k);
      for (const sg of [-1, 1]) {
        paintPath(circ(sg * 0.08, -0.53, 0.055), [250, 248, 244], 1, k);
        paintPath(circ(sg * 0.08, -0.53, 0.03), blackC, fade, k);
      }
    },
    (k) => paintPath(poly(KITE.tail), blackC, 0.92 * fade, k),
    (k) => {
      paintPath(circ(0, 0.12, 0.1), redC, 0.95, k);
      for (const sg of [-1, 1]) {
        paintPath(circ(sg * 0.6, -0.22, 0.075), redC, 0.95, k);
        paintPath(circ(sg * 0.13, -0.44, 0.04), redC, 0.9, k);
      }
    },
    (k) => {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = a * k;
      ctx.lineWidth = 0.028;
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(blackC, 0.85 * fade);
      for (const sg of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sg * 0.8, -0.24, 0.06, 0, Math.PI * 1.5); ctx.stroke();
        ctx.beginPath(); ctx.arc(sg * 0.36, -0.2, 0.05, Math.PI, TAU + Math.PI * 0.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sg * 0.12, 0.3); ctx.quadraticCurveTo(sg * 0.18, 0.18, sg * 0.1, 0.06); ctx.stroke();
      }
      ctx.restore();
    },
  ];
  const nS = steps.length;
  for (let i = 0; i < nS; i++) {
    const k = clamp(paint * nS - i);
    if (k <= 0) break;
    steps[i](k);
  }
  // 补丁（爷爷补上，画了一只小燕子）
  if (o.patch) {
    const pp = poly([[-0.66, -0.3], [-0.42, -0.33], [-0.4, -0.12], [-0.64, -0.1]]);
    paintPath(pp, [238, 228, 206], 1, o.patch);
    ctx.save();
    ctx.globalAlpha = a * o.patch;
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineWidth = lw * 0.9;
    ctx.strokeStyle = rgba(inkRGB(0.6), 0.85);
    ctx.stroke(pp);
    drawSwallowGlyph(ctx, -0.53, -0.21, 0.085 * clamp(o.patchPaint ?? 1), inkRGB(0.92));
    ctx.restore();
  }
  if (o.torn) {
    const tp = poly([[-0.6, -0.27], [-0.5, -0.26], [-0.53, -0.19], [-0.45, -0.14], [-0.58, -0.15]]);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = a * o.torn;
    ctx.fill(tp);
    ctx.restore();
    if (W8) { W8.save(); W8.globalCompositeOperation = 'destination-out'; W8.fill(tp); W8.restore(); }
  }
  // 轮廓墨线
  ctx.globalCompositeOperation = 'multiply';
  if (!o.overpaint) stroke(ctx, [...KITE.outline, KITE.outline[0]], { w: lw * 1.1, tone: 0.85 - aged * 0.3, alpha: 0.9 * a * paper, dry: 0.05, body: 1, taperIn: 0, taperOut: 0, seed: 210, wobble: 0.1 });
  ctx.lineWidth = lw * 1.0;
  ctx.strokeStyle = rgba(inkRGB(0.85 - aged * 0.3), 0.85 * a * paper);
  ctx.stroke(headP);
  ctx.restore();
  if (W8) W8.setTransform(ctx.getTransform());
}

// 扎骨架时笔尖（手）的位置
export function kiteFrameTip(o, fr) {
  const n = KITE.frame.length;
  const i = Math.min(n - 1, Math.floor(clamp(fr) * n));
  const k = clamp(fr * n - i);
  return tr(o, along(KITE.frame[i], k).p);
}
// 上色时笔尖经过的路线（局部坐标）
const PAINT_PATH = [[-0.2, -0.5], [-0.6, -0.48], [-0.95, -0.4], [-0.6, -0.42], [-0.2, -0.5], [0.2, -0.5], [0.6, -0.48], [0.95, -0.4], [0.5, -0.44], [0, -0.6], [0, -0.5], [-0.15, 0.4], [-0.35, 0.9], [0, 0.55], [0.35, 0.9], [0.15, 0.4], [0, 0.12], [-0.6, -0.22], [0.6, -0.22], [0.8, -0.25], [0.35, -0.2], [-0.35, -0.2], [-0.8, -0.25]];
export function kitePaintTip(o, p) {
  return tr(o, along(PAINT_PATH, clamp(p)).p);
}
export function kiteLocal(o, q) {
  return tr(o, q);
}

// 风筝上牵线的点（局部坐标转世界）
export function kiteBridle(o) {
  return tr(o, [0, -0.08]);
}

// 一只极简的小燕子（补丁图案、远处的燕子都用它）
export function drawSwallowGlyph(ctx, x, y, s, col, flap = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  const w = flap;
  ctx.moveTo(-s * 1.4, -s * (0.35 + w));
  ctx.quadraticCurveTo(-s * 0.5, -s * 0.2, 0, s * 0.15);
  ctx.quadraticCurveTo(s * 0.5, -s * 0.2, s * 1.4, -s * (0.35 + w));
  ctx.quadraticCurveTo(s * 0.6, s * 0.1, 0, s * 0.45);
  ctx.quadraticCurveTo(-s * 0.6, s * 0.1, -s * 1.4, -s * (0.35 + w));
  ctx.fillStyle = rgba(col, 0.95);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.15, s * 0.4); ctx.lineTo(-s * 0.35, s * 1.0); ctx.lineTo(0, s * 0.6); ctx.lineTo(s * 0.35, s * 1.0); ctx.lineTo(s * 0.15, s * 0.4);
  ctx.fill();
  ctx.restore();
}

// ---------- 红线 ----------
// 从 a（手/线轴）到 b（风筝）的一段垂线；width 为屏幕像素宽度/缩放后的世界宽度
export function drawString(ctx, a, b, o = {}) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const sag = (o.sag ?? 0.08) * d;
  const t = o.t ?? 0;
  const mid = [(a[0] + b[0]) / 2 + noise1(t * 0.7, 3) * d * 0.012, (a[1] + b[1]) / 2 + sag];
  const pts = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const q = quadPt(a, mid, b, u);
    q[0] += Math.sin(u * 9 + t * 5) * (o.wobble ?? 0.6) * Math.sin(u * Math.PI);
    pts.push(q);
  }
  const upto = o.upto ?? 1;
  const from = o.from ?? 0;
  const P = pts.slice(Math.floor(from * n), Math.ceil(upto * n) + 1);
  if (P.length < 2) return pts;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = o.width ?? 1.5;
  ctx.strokeStyle = rgba(o.color || C.vermilion, o.alpha ?? 0.95);
  ctx.beginPath();
  ctx.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]);
  ctx.stroke();
  ctx.restore();
  return pts;
}

// 线上的结
export function drawKnot(ctx, p, r, a = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = rgba(C.vermilion, a);
  ctx.lineWidth = r * 0.45;
  ctx.beginPath();
  ctx.ellipse(p[0], p[1], r, r * 0.65, 0.6, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = rgba(C.vermilion, a);
  ctx.beginPath();
  ctx.arc(p[0], p[1], r * 0.45, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ---------- 线拐子 ----------
export function drawReel(ctx, x, y, s, rot = 0, a = 1, thread = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = a;
  const wood = C.wood;
  ctx.fillStyle = rgba(wood, 1);
  ctx.fillRect(-s * 0.55, -s * 0.12, s * 1.1, s * 0.24);
  ctx.fillRect(-s * 0.5, -s * 0.7, s * 0.14, s * 1.4);
  ctx.fillRect(s * 0.36, -s * 0.7, s * 0.14, s * 1.4);
  if (thread > 0) {
    ctx.fillStyle = rgba(C.vermilion, 0.95);
    ctx.fillRect(-s * 0.36, -s * 0.45 * thread, s * 0.72, s * 0.9 * thread);
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = rgba([150, 40, 30], 0.5);
    ctx.lineWidth = s * 0.03;
    for (let k = -3; k <= 3; k++) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.36, k * s * 0.12 * thread);
      ctx.lineTo(s * 0.36, k * s * 0.12 * thread + s * 0.05);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = rgba(inkRGB(0.85), 0.9);
  ctx.lineWidth = s * 0.05;
  ctx.strokeRect(-s * 0.5, -s * 0.7, s * 0.14, s * 1.4);
  ctx.strokeRect(s * 0.36, -s * 0.7, s * 0.14, s * 1.4);
  ctx.restore();
}

// ---------- 小木凳 ----------
export function drawStool(ctx, x, y, s = 1, snow = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalCompositeOperation = 'source-over';
  const wood = C.wood;
  ctx.fillStyle = rgba(wood.map((v) => v * 0.95), 1);
  ctx.fillRect(-16, -20, 32, 5);
  ctx.fillStyle = rgba(wood.map((v) => v * 0.8), 1);
  for (const lx of [-13, -6, 4, 11]) ctx.fillRect(lx, -15, 3, 15);
  ctx.globalCompositeOperation = 'multiply';
  stroke(ctx, [[-17, -20], [17, -20]], { w: 1.6, tone: 0.9, dry: 0.2, seed: 301 });
  stroke(ctx, [[-17, -15], [17, -15]], { w: 1.2, tone: 0.85, dry: 0.2, seed: 302 });
  if (snow > 0) {
    const W8 = whiteOf(ctx);
    if (W8) {
      W8.fillStyle = `rgba(255,255,255,${0.95 * snow})`;
      W8.beginPath();
      W8.ellipse(0, -21, 17, 3.5 * snow + 1, 0, Math.PI, TAU);
      W8.fill();
    }
  }
  ctx.restore();
}

// ---------- 燕子 ----------
export function drawSwallow(ctx, x, y, s, heading = 0, phase = 0, a = 1) {
  const flap = Math.sin(phase * TAU);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = a;
  const col = inkRGB(0.92);
  ctx.fillStyle = rgba(col, 1);
  // 身体
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.55, s * 0.2, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s * 0.5, -s * 0.02, s * 0.17, 0, TAU);
  ctx.fill();
  // 剪刀尾
  ctx.beginPath();
  ctx.moveTo(-s * 0.4, -s * 0.05);
  ctx.lineTo(-s * 1.15, -s * 0.28);
  ctx.lineTo(-s * 0.62, 0);
  ctx.lineTo(-s * 1.15, s * 0.26);
  ctx.lineTo(-s * 0.4, s * 0.06);
  ctx.fill();
  // 翅膀（上下扇动）
  for (const side of [-1, 1]) {
    const wy = side * s * (0.25 + 0.75 * (0.5 + 0.5 * flap * side));
    ctx.beginPath();
    ctx.moveTo(s * 0.2, 0);
    ctx.quadraticCurveTo(-s * 0.1, wy * 0.7, -s * 0.55, wy * 1.25);
    ctx.quadraticCurveTo(-s * 0.05, wy * 0.45, -s * 0.2, 0);
    ctx.closePath();
    ctx.fill();
  }
  // 白腹
  const W8 = whiteOf(ctx);
  if (W8) {
    W8.save();
    W8.globalAlpha = a * 0.9;
    W8.fillStyle = '#fff';
    W8.beginPath();
    W8.ellipse(s * 0.1, s * 0.08, s * 0.3, s * 0.08, 0, 0, TAU);
    W8.fill();
    W8.restore();
  }
  ctx.restore();
}

// 一群燕子沿路径飞：pathFn(u) → [x,y]，u 随时间推进
export function drawFlock(ctx, t, o) {
  const n = o.count ?? 6;
  for (let i = 0; i < n; i++) {
    const h = hash(o.seed ?? 1, i);
    const u = (o.u0 ?? 0) + t * (o.speed ?? 0.1) + h * (o.spread ?? 0.3);
    const p = o.path(u, i, h);
    const q = o.path(u + 0.01, i, h);
    const head = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const off = [noise1(t * 0.8 + i, 11) * (o.jitter ?? 20), noise1(t * 0.8 + i, 12) * (o.jitter ?? 20) * 0.6];
    drawSwallow(ctx, p[0] + off[0], p[1] + off[1], (o.size ?? 14) * (0.8 + h * 0.4), head, t * (o.flapRate ?? 3.2) + h, o.alpha ?? 1);
  }
}
