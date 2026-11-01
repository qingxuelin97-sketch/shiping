// 山坡、小路、大路、小屋、草、天空 —— 主场景的近景部分（世界坐标）
import { Rng, noise1, noise2, hash } from '../core/noise.js';
import { spline, clamp, lerp, TAU, resample } from '../core/math.js';
import { stroke, blob, rgba, inkRGB, softDot, line, whiteOf } from '../ink/brush.js';
import { C } from './palette.js';

export const HILL = spline([
  [-500, 1110], [-100, 1046], [300, 966], [640, 884], [920, 802], [1120, 749], [1290, 718], [1450, 716], [1650, 734], [1900, 768], [2400, 830],
], 10);

export function hillY(x) {
  for (let i = 1; i < HILL.length; i++) {
    if (HILL[i][0] >= x) {
      const a = HILL[i - 1], b = HILL[i];
      return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0] || 1));
    }
  }
  return HILL[HILL.length - 1][1];
}

// 前景右下角的土坡（压住画面，增加纵深）
export const BANK = spline([[1380, 1120], [1520, 1052], [1700, 1004], [1880, 978], [2100, 968]], 10);

export const PATH = spline([
  [1186, 728], [1112, 754], [1036, 790], [1066, 832], [986, 870], [862, 904], [762, 944], [672, 990], [592, 1034], [542, 1074], [500, 1120],
], 10);

export const ROAD_Y = (x) => 1066 + Math.sin(x * 0.0021) * 10;

function ridgeWash(ctx, R, depth, col, alpha, seed) {
  const bands = 24;
  for (let b = 0; b < bands; b++) {
    const k = Math.pow(1 - b / bands, 1.7);
    ctx.beginPath();
    ctx.moveTo(R[0][0], R[0][1] + b * (depth / bands));
    for (const p of R) ctx.lineTo(p[0], p[1] + b * (depth / bands) + noise1(p[0] * 0.012, b + seed) * 5);
    for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1] + (b + 1.6) * (depth / bands));
    ctx.closePath();
    ctx.fillStyle = rgba(col, alpha * k);
    ctx.fill();
  }
}

// 用纸白把轮廓线以下的部分盖住（近处的山坡挡住远山）
export function occlude(ctx, R, bottom = 1500) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(R[0][0], bottom);
  for (const p of R) ctx.lineTo(p[0], p[1] + 2);
  ctx.lineTo(R[R.length - 1][0], bottom);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function brokenLine(ctx, R, o, seed) {
  const rng = new Rng(seed);
  let i = 0;
  while (i < R.length - 3) {
    const n = Math.floor(rng.range(o.min ?? 10, o.max ?? 34));
    const seg = R.slice(i, Math.min(R.length, i + n));
    stroke(ctx, seg, { w: rng.range(o.w0 ?? 3, o.w1 ?? 7), tone: o.tone ?? 0.72, dry: o.dry ?? 0.5, seed: seed + i, alpha: o.alpha ?? 0.85, taperIn: 0.25, taperOut: 0.35, color: o.color });
    i += n + Math.floor(rng.range(1, o.gap ?? 9));
  }
}

// 山坡
export function drawHill(ctx, t, o = {}) {
  const season = o.seasonColor || C.springGreen;
  const amt = o.colorAmt ?? 0.45;
  const snow = o.snow ?? 0;
  occlude(ctx, HILL);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const tintCol = season.map((v) => lerp(255, v, amt));
  ridgeWash(ctx, HILL, 230, tintCol, 0.32, 0);
  ridgeWash(ctx, HILL, 120, inkRGB(0.5), 0.07 * (1 - snow * 0.4), 9);
  // 侧锋扫出的坡面肌理
  const rng = new Rng(77);
  for (let k = 0; k < 16; k++) {
    const x = rng.range(-50, 2000);
    const y = hillY(x) + rng.range(30, 300);
    if (y > 1090) continue;
    const len = rng.range(60, 180);
    const pts = [[x, y], [x + len * 0.5, y - len * 0.06 + rng.range(-4, 4)], [x + len, y - len * 0.1]];
    stroke(ctx, pts, { w: rng.range(5, 12), color: season.map((v) => lerp(140, v, 0.5)), dry: 0.85, alpha: rng.range(0.12, 0.25), seed: 500 + k, taperIn: 0.4, taperOut: 0.6 });
  }
  // 山脊线
  brokenLine(ctx, HILL.map((p) => [p[0], p[1] + 1]), { w0: 3, w1: 7.5, tone: 0.74, dry: 0.5 }, 400);
  // 苔点：沿山脊成簇
  for (let k = 0; k < 46; k++) {
    const x = rng.range(-100, 2100);
    if (Math.abs(x - 1290) < 50) continue;
    const y = hillY(x);
    const cl = rng.int(2, 4);
    for (let j = 0; j < cl; j++) blob(ctx, x + rng.range(-9, 9), y + rng.range(-1, 6), rng.range(1.1, 2.4), { tone: 0.86, alpha: 0.7 * (1 - snow * 0.5), seed: k * 5 + j });
  }
  drawRock(ctx, 1388, 726, 34, 18, 5);
  drawRock(ctx, 1128, 748, 22, 12, 9);
  // 积雪：白粉覆盖坡面，沿山脊最厚
  if (snow > 0.01) {
    const W8 = whiteOf(ctx);
    if (W8) {
      ridgeWash(W8, HILL, 320, [255, 255, 255], 0.16 * snow, 1);
    }
  }
  ctx.restore();
}

// 前景右下角土坡
export function drawBank(ctx, t, o = {}) {
  const season = o.seasonColor || C.springGreen;
  const amt = o.colorAmt ?? 0.45;
  const snow = o.snow ?? 0;
  occlude(ctx, BANK);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const tintCol = season.map((v) => lerp(255, v, amt));
  ridgeWash(ctx, BANK, 160, tintCol, 0.45, 3);
  ridgeWash(ctx, BANK, 90, inkRGB(0.6), 0.12 * (1 - snow * 0.4), 4);
  brokenLine(ctx, BANK, { w0: 5, w1: 11, tone: 0.82, dry: 0.45, min: 8, max: 20 }, 450);
  if (snow > 0.01) {
    const W8 = whiteOf(ctx);
    if (W8) ridgeWash(W8, BANK, 200, [255, 255, 255], 0.2 * snow, 2);
  }
  ctx.restore();
}

export function drawRock(ctx, x, y, w, h, seed) {
  const rng = new Rng(seed);
  const pts = [];
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI + (k / 10) * Math.PI;
    pts.push([x + Math.cos(a) * w * (0.9 + rng.range(-0.1, 0.12)), y + Math.sin(a) * h * (0.9 + rng.range(-0.15, 0.15))]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fillStyle = rgba(inkRGB(0.25), 0.3);
  ctx.fill();
  stroke(ctx, pts, { w: 3.2, tone: 0.85, dry: 0.5, seed, taperIn: 0.1, taperOut: 0.2 });
  stroke(ctx, [[x - w * 0.3, y - h * 0.7], [x - w * 0.1, y - h * 0.3], [x - w * 0.2, y]], { w: 2, tone: 0.75, dry: 0.7, seed: seed + 1, alpha: 0.6 });
}

// 下山的小路：淡淡一抹，两侧断续的细线
export function drawPath(ctx, o = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const P = resample(PATH, 6);
  const wAt = (s) => lerp(8, 30, s);
  stroke(ctx, P, { w: wAt, color: o.color || [222, 214, 200], alpha: 0.38, dry: 0.35, seed: 61, taperIn: 0.08, taperOut: 0.02, body: 0.6 });
  for (const side of [-1, 1]) {
    const E = P.map((p, i) => {
      const s = i / (P.length - 1);
      const j = Math.min(i + 1, P.length - 1), h = Math.max(i - 1, 0);
      const dx = P[j][0] - P[h][0], dy = P[j][1] - P[h][1];
      const l = Math.hypot(dx, dy) || 1;
      const hw = wAt(s) * 0.55;
      return [p[0] - (dy / l) * hw * side, p[1] + (dx / l) * hw * side];
    });
    brokenLine(ctx, E, { w0: 1.2, w1: 2.2, tone: 0.6, dry: 0.3, alpha: 0.55, min: 5, max: 14, gap: 7 }, 70 + side);
  }
  ctx.restore();
}

// 山脚的大路
export function drawRoad(ctx, o = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const top = [], bot = [];
  for (let x = -300; x <= 1400; x += 20) {
    top.push([x, ROAD_Y(x) - 18 + (x > 1100 ? (x - 1100) * 0.12 : 0)]);
    bot.push([x, ROAD_Y(x) + 20 + (x > 1100 ? (x - 1100) * 0.1 : 0)]);
  }
  ctx.beginPath();
  ctx.moveTo(top[0][0], top[0][1]);
  for (const p of top) ctx.lineTo(p[0], p[1]);
  for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
  ctx.closePath();
  ctx.fillStyle = rgba(o.color || [226, 218, 204], 0.4);
  ctx.fill();
  brokenLine(ctx, top, { w0: 1.4, w1: 2.4, tone: 0.6, dry: 0.5, alpha: 0.6, min: 6, max: 16, gap: 5 }, 81);
  brokenLine(ctx, bot, { w0: 1.8, w1: 2.8, tone: 0.65, dry: 0.5, alpha: 0.6, min: 6, max: 16, gap: 5 }, 82);
  ctx.restore();
}

// 农家小院（爷爷家），左下角
export function drawCottage(ctx, t, o = {}) {
  const x = 262, y = 1012;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  // 院边的老柳
  const wr = new Rng(31);
  stroke(ctx, [[x - 128, y + 4], [x - 132, y - 60], [x - 120, y - 120], [x - 126, y - 150]], { w: (s) => lerp(12, 5, s), tone: 0.78, dry: 0.5, seed: 33, taperIn: 0, taperOut: 0.3 });
  for (let k = 0; k < 16; k++) {
    const sx = x - 126 + wr.range(-40, 50), sy = y - 150 + wr.range(-20, 20);
    const sw = noise1(t * 0.6 + k, 3) * 6;
    stroke(ctx, [[sx, sy], [sx + 6 + sw * 0.5, sy + 40], [sx + 4 + sw, sy + wr.range(70, 110)]], { w: 1.4, color: C.springLeaf.map((v) => v * 0.8), alpha: 0.7, dry: 0, taperIn: 0.1, taperOut: 0.8, seed: 40 + k });
  }
  // 墙
  ctx.fillStyle = rgba([226, 216, 198], 0.55);
  ctx.fillRect(x - 72, y - 58, 144, 58);
  stroke(ctx, [[x - 72, y - 56], [x - 73, y]], { w: 2.4, tone: 0.8, dry: 0.4, seed: 91 });
  stroke(ctx, [[x + 72, y - 56], [x + 71, y]], { w: 2.4, tone: 0.8, dry: 0.4, seed: 92 });
  stroke(ctx, [[x - 78, y], [x + 80, y + 1]], { w: 2.6, tone: 0.75, dry: 0.5, seed: 93 });
  // 门窗
  ctx.fillStyle = rgba(inkRGB(0.72), 0.85);
  ctx.fillRect(x - 13, y - 38, 24, 38);
  stroke(ctx, [[x - 1, y - 38], [x - 1, y]], { w: 1, tone: 0.3, alpha: 0.6, dry: 0, seed: 97 });
  ctx.fillStyle = rgba(inkRGB(0.55), 0.6);
  ctx.fillRect(x + 30, y - 42, 22, 15);
  // 青瓦屋顶，屋脊和檐口两端起翘
  const ridge = [[x - 92, y - 92], [x - 60, y - 98], [x, y - 100], [x + 60, y - 98], [x + 94, y - 93]];
  const eave = [[x - 108, y - 52], [x - 86, y - 60], [x, y - 62], [x + 86, y - 60], [x + 110, y - 51]];
  ctx.beginPath();
  ctx.moveTo(ridge[0][0], ridge[0][1]);
  for (const p of ridge) ctx.lineTo(p[0], p[1]);
  for (let i = eave.length - 1; i >= 0; i--) ctx.lineTo(eave[i][0], eave[i][1]);
  ctx.closePath();
  ctx.fillStyle = rgba(inkRGB(0.55), 0.85);
  ctx.fill();
  for (let k = 0; k < 15; k++) {
    const u = k / 14;
    const a = [lerp(ridge[0][0], ridge[4][0], u), lerp(ridge[0][1], ridge[4][1], u) + Math.sin(u * Math.PI) * -6];
    const b = [lerp(eave[0][0], eave[4][0], u), lerp(eave[0][1], eave[4][1], u) + Math.sin(u * Math.PI) * -8];
    stroke(ctx, [a, b], { w: 2.4, tone: 0.9, dry: 0.45, seed: 95 + k, alpha: 0.75, taperIn: 0.1, taperOut: 0.1 });
  }
  stroke(ctx, spline(ridge, 6), { w: 6, tone: 0.95, dry: 0.3, seed: 94, taperIn: 0.05, taperOut: 0.05 });
  stroke(ctx, spline(eave, 6), { w: 3.5, tone: 0.92, dry: 0.35, seed: 98, taperIn: 0.05, taperOut: 0.05 });
  if (o.snow) {
    const W8 = whiteOf(ctx);
    if (W8) {
      W8.beginPath();
      W8.moveTo(ridge[0][0], ridge[0][1] - 2);
      for (const p of ridge) W8.lineTo(p[0], p[1] - 3);
      for (let i = eave.length - 1; i >= 0; i--) W8.lineTo(eave[i][0], eave[i][1] - 6);
      W8.closePath();
      W8.fillStyle = `rgba(255,255,255,${0.85 * o.snow})`;
      W8.fill();
    }
  }
  // 烟囱和炊烟
  ctx.fillStyle = rgba(inkRGB(0.8), 0.9);
  ctx.fillRect(x + 40, y - 116, 11, 22);
  if (o.smoke) {
    for (let k = 0; k < 10; k++) {
      const age = (t * 0.22 + k / 10) % 1;
      const sx = x + 46 + noise1(age * 3 + k, 5) * 16 + age * 70;
      const sy = y - 122 - age * 180;
      softDot(ctx, sx, sy, 9 + age * 36, inkRGB(0.45), 0.14 * (1 - age) * o.smoke, 0.7);
    }
  }
  // 矮院墙和柴门
  stroke(ctx, [[x + 82, y + 6], [x + 190, y + 10]], { w: 7, tone: 0.45, dry: 0.6, seed: 120, alpha: 0.7 });
  for (let k = 0; k < 5; k++) stroke(ctx, [[x + 196 + k * 9, y + 10], [x + 197 + k * 9, y - 12]], { w: 1.8, tone: 0.75, dry: 0.4, seed: 125 + k });
  ctx.restore();
}

// 草：成簇长在山脊和小路边，随风摆
const TUFTS = (() => {
  const rng = new Rng(17);
  const out = [];
  for (let k = 0; k < 90; k++) {
    let x, y;
    const r = rng.next();
    if (r < 0.55) { x = rng.range(-100, 2100); y = hillY(x) + Math.pow(rng.next(), 2) * 40; }
    else if (r < 0.8) { const i = Math.floor(rng.range(0, PATH.length)); x = PATH[i][0] + rng.range(-30, 30); y = PATH[i][1] + rng.range(-8, 12); }
    else { x = rng.range(1450, 2000); y = 1000 + rng.range(0, 60); }
    out.push({ x, y, n: rng.int(4, 9), h: rng.range(10, 24), seed: rng.range(0, 999) });
  }
  return out;
})();

export function drawGrass(ctx, t, o = {}) {
  const wind = o.wind ?? 0.6;
  const col = o.color || C.springLeaf;
  const amt = o.colorAmt ?? 0.6;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (const g of TUFTS) {
    if (o.region && (g.x < o.region[0] || g.x > o.region[2] || g.y < o.region[1] || g.y > o.region[3])) continue;
    const bend = -wind * (0.25 + 0.25 * noise1(t * 0.9 + g.x * 0.004, 3));
    for (let k = 0; k < g.n; k++) {
      const spread = (k / (g.n - 1 || 1) - 0.5);
      const a = -Math.PI / 2 + spread * 1.3 + (hash(g.seed, k) - 0.5) * 0.5;
      const h = g.h * (0.45 + hash(g.seed, k + 9) * 0.75);
      const bx = g.x + spread * 8;
      const lean = bend * (0.6 + hash(g.seed, k + 3) * 0.6);
      const tip = [bx + Math.cos(a) * h + lean * h * 0.7, g.y + Math.sin(a) * h + Math.abs(lean) * h * 0.15];
      const mid = [bx + Math.cos(a) * h * 0.5 + lean * h * 0.2, g.y + Math.sin(a) * h * 0.55];
      const tone = 0.55 + hash(g.seed, k + 5) * 0.3;
      const c = inkRGB(tone).map((v, i) => lerp(v, col[i] * 0.75, amt * 0.5));
      stroke(ctx, [[bx, g.y], mid, tip], { w: 1.2 + hash(g.seed, k + 1) * 1.2, color: c, alpha: 0.85 * (o.alpha ?? 1), dry: 0, taperIn: 0.02, taperOut: 0.95, seed: g.seed + k });
    }
  }
  ctx.restore();
}

// 天空淡彩（屏幕坐标）
export function drawSky(ctx, o = {}) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const g = ctx.createLinearGradient(0, 0, 0, 1080);
  const top = o.top || [240, 240, 238];
  const hor = o.horizon || [252, 248, 240];
  g.addColorStop(0, rgba(top, o.topAlpha ?? 0.6));
  g.addColorStop(0.55, rgba(hor, o.horAlpha ?? 0.4));
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-100, -100, 2120, 1280);
  if (o.sun) {
    const [sx, sy, sr] = o.sun;
    softDot(ctx, sx, sy, sr * 3.2, o.sunGlow || C.sunset, 0.45 * (o.sunAlpha ?? 1));
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, TAU);
    ctx.fillStyle = rgba(o.sunColor || C.sunsetDeep, 0.85 * (o.sunAlpha ?? 1));
    ctx.fill();
  }
  ctx.restore();
}
