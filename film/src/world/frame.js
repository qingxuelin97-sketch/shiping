// 前景框与光：
//   frameBranch —— 画面一角探进来的一枝虚化的梨花 / 枯枝 / 雪枝（前景层，整体模糊，像镜头前的花枝）
//   drawBeams   —— 透过梨树的淡光束（背景白粉层）
// 模糊的做法：在 1/4 分辨率的小画布上画，再带 blur 滤镜放大贴回前景层，代价很小。
import { makeCanvas } from '../core/canvas.js';
import { stroke, rgba, inkRGB } from '../ink/brush.js';
import { noise1, hash } from '../core/noise.js';
import { TAU, lerp, clamp } from '../core/math.js';
import { C } from './palette.js';

let BUF = null;
function buffers(w, h) {
  if (!BUF || BUF.w !== w || BUF.h !== h) {
    BUF = { w, h, ink: makeCanvas(w, h), white: makeCanvas(w, h), tmp: makeCanvas(w, h) };
  }
  for (const k of ['ink', 'white', 'tmp']) {
    const c = BUF[k].ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.filter = 'none';
    c.clearRect(0, 0, w, h);
  }
  return BUF;
}

// 生成一枝：从画外的角伸进来（沿路径积分，枝条自然弯曲）
function branchGeom(o) {
  const seed = o.seed ?? 1;
  const corner = o.corner || 'tl';
  const sx = corner.includes('r') ? -1 : 1, sy = corner.includes('b') ? -1 : 1;
  const ox = sx > 0 ? -30 : 1950, oy = sy > 0 ? -30 : 1110;
  const len = o.len ?? 700;
  const a0 = Math.atan2(sy * (o.dip ?? 0.5), sx * 1);
  const sway = o.sway ?? 0;
  const walk = (p0, ang0, L, n, sd, curve) => {
    const pts = [p0];
    let p = p0;
    for (let i = 1; i <= n; i++) {
      const q = i / n;
      const ang = ang0 + noise1(q * 1.6, sd) * 0.45 + curve * q + sway * q * q;
      p = [p[0] + Math.cos(ang) * L / n, p[1] + Math.sin(ang) * L / n];
      pts.push(p);
    }
    return pts;
  };
  const main = walk([ox, oy], a0, len, 12, seed, 0.3 * sy * sx);
  const subs = [];
  [[0.38, 0.75, 0.42], [0.6, -0.6, 0.36], [0.82, 0.55, 0.26]].forEach(([at, da, l], k) => {
    const i = Math.round(at * 12);
    const p = main[i], pn = main[Math.min(12, i + 1)];
    const ang = Math.atan2(pn[1] - p[1], pn[0] - p[0]) + da;
    subs.push(walk(p, ang, len * l, 6, seed + 9 + k, -da * 0.4));
  });
  return { main, subs };
}

/**
 * o: { corner 'tl'|'tr'|'bl'|'br', kind 'blossom'|'bare'|'snow'|'leaf', len, dip, blur(虚拟px), alpha,
 *      shift [dx,dy]（随镜头的视差平移）, t, wind, seed }
 */
export function frameBranch(F, R, o = {}) {
  const W = R.W, H = R.H;
  const k = 0.25; // 小画布比例
  const w = Math.ceil(W * k), h = Math.ceil(H * k);
  const B = buffers(w, h);
  const s = (W / 1920) * k;
  const t = o.t ?? 0;
  const sway = Math.sin(t * 0.9 + (o.seed ?? 1)) * 0.03 * (o.wind ?? 1) + noise1(t * 0.4, o.seed ?? 1) * 0.02;
  const G = branchGeom({ ...o, sway });
  const sh = o.shift || [0, 0];
  const kind = o.kind || 'blossom';
  const ci = B.ink.ctx, cw = B.white.ctx;
  for (const c of [ci, cw]) c.setTransform(s, 0, 0, s, sh[0] * s, sh[1] * s);
  // 枝
  const tone = kind === 'snow' ? 0.8 : 0.9;
  stroke(ci, G.main, { w: (q) => lerp(42, 10, q), tone, alpha: 1, dry: 0.1, seed: 3, body: 1 });
  G.subs.forEach((p, i) => stroke(ci, p, { w: (q) => lerp(16, 4, q), tone, alpha: 1, dry: 0.1, seed: 5 + i, body: 1 }));
  // 花 / 叶 / 雪
  const spots = [];
  G.subs.forEach((p) => { spots.push(p[p.length - 1], p[3]); });
  spots.push(G.main[12], G.main[10], G.main[7]);
  spots.forEach((p, i) => {
    const n = kind === 'bare' ? 0 : 6;
    for (let j = 0; j < n; j++) {
      const a = hash(i, j + 1) * TAU, r = 10 + hash(j, i + 3) * 46;
      const x = p[0] + Math.cos(a) * r, y = p[1] + Math.sin(a) * r * 0.8;
      if (kind === 'blossom') {
        cw.fillStyle = 'rgba(255,255,255,0.95)';
        cw.beginPath();
        cw.arc(x, y, 12 + hash(i, j + 7) * 9, 0, TAU);
        cw.fill();
        ci.fillStyle = rgba([214, 220, 196], 1);
        ci.beginPath();
        ci.arc(x, y, 12 + hash(i, j + 7) * 9, 0, TAU);
        ci.fill();
        if (j % 2 === 0) {
          ci.fillStyle = rgba(C.springLeaf, 1);
          ci.beginPath();
          ci.ellipse(x + 18, y + 10, 16, 7, a, 0, TAU);
          ci.fill();
        }
      } else if (kind === 'leaf') {
        ci.fillStyle = rgba(o.leafColor || C.summerGreen, 1);
        ci.beginPath();
        ci.ellipse(x, y, 22, 9, a, 0, TAU);
        ci.fill();
      } else if (kind === 'snow') {
        cw.fillStyle = 'rgba(255,255,255,0.95)';
        cw.beginPath();
        cw.ellipse(x, y, 18, 8, 0, 0, TAU);
        cw.fill();
      }
    }
  });
  if (kind === 'snow') {
    // 枝上积雪
    cw.lineCap = 'round';
    cw.strokeStyle = 'rgba(255,255,255,0.95)';
    cw.lineWidth = 14;
    cw.beginPath();
    G.main.forEach((q, i) => (i ? cw.lineTo(q[0], q[1] - 16) : cw.moveTo(q[0], q[1] - 16)));
    cw.stroke();
  }
  // 模糊后放大贴到前景层与前景白粉层
  const blurPx = (o.blur ?? 10) * s;
  const put = (src, dst) => {
    const tc = B.tmp.ctx;
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.clearRect(0, 0, w, h);
    tc.filter = `blur(${blurPx.toFixed(2)}px)`;
    tc.drawImage(src, 0, 0);
    tc.filter = 'none';
    dst.save();
    dst.setTransform(1, 0, 0, 1, 0, 0);
    dst.globalAlpha = o.alpha ?? 1;
    dst.globalCompositeOperation = 'source-over';
    dst.imageSmoothingEnabled = true;
    dst.imageSmoothingQuality = 'high';
    dst.drawImage(B.tmp, 0, 0, w, h, 0, 0, W, H);
    dst.restore();
  };
  put(B.ink, F);
  if (F.white) put(B.white, F.white);
}

// 透过树冠的淡光束（世界坐标，画在背景白粉层上）
export function drawBeams(Wc, t, k = 1, o = {}) {
  if (!Wc || k <= 0) return;
  const ang = o.ang ?? 1.98;
  const dir = [Math.cos(ang), Math.sin(ang)];
  const nrm = [-dir[1], dir[0]];
  Wc.save();
  Wc.globalCompositeOperation = 'source-over';
  const n = o.count ?? 6;
  for (let i = 0; i < n; i++) {
    const x0 = (o.x ?? 1200) + i * (o.gap ?? 62) + hash(i, 3) * 30;
    const y0 = (o.y ?? 360) + hash(i, 5) * 60;
    const L = (o.len ?? 760) * (0.7 + hash(i, 7) * 0.5);
    const w0 = 10 + hash(i, 9) * 18, w1 = w0 * 3.2;
    const flick = 0.55 + 0.45 * Math.sin(t * (0.25 + hash(i, 11) * 0.3) + i * 1.7);
    const a = k * (o.alpha ?? 0.13) * flick;
    const g = Wc.createLinearGradient(x0, y0, x0 + dir[0] * L, y0 + dir[1] * L);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.25, `rgba(255,255,255,${a.toFixed(3)})`);
    g.addColorStop(0.7, `rgba(255,255,255,${(a * 0.5).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    Wc.fillStyle = g;
    Wc.beginPath();
    Wc.moveTo(x0 + nrm[0] * w0, y0 + nrm[1] * w0);
    Wc.lineTo(x0 + dir[0] * L + nrm[0] * w1, y0 + dir[1] * L + nrm[1] * w1);
    Wc.lineTo(x0 + dir[0] * L - nrm[0] * w1, y0 + dir[1] * L - nrm[1] * w1);
    Wc.lineTo(x0 - nrm[0] * w0, y0 - nrm[1] * w0);
    Wc.closePath();
    Wc.fill();
  }
  Wc.restore();
}

export { clamp };
