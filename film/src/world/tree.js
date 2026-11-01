// 老梨树：固定种子生成同一副枝干，四季只换花、叶、雪。枝条随风摆动（无状态）。
// 造型：粗短虬曲的主干，五根主枝向四周舒展，树冠圆阔。
import { Rng, noise1, hash } from '../core/noise.js';
import { stroke, blob, rgba, inkRGB, softDot, whiteOf } from '../ink/brush.js';
import { clamp, lerp, TAU, smoothstep } from '../core/math.js';
import { C } from './palette.js';

// 树冠包络（相对树根）：中心与半径
const CROWN = { cx: 0, cy: -255, rx: 400, ry: 215 };

function insideCrown(x, y) {
  const dx = (x - CROWN.cx) / CROWN.rx, dy = (y - CROWN.cy) / CROWN.ry;
  return dx * dx + dy * dy;
}

function makeBranch(rng, ang, len, w0, depth, origin, opts = {}) {
  const segLen = depth === 0 ? 14 : depth <= 1 ? 11 : 8;
  const n = Math.max(3, Math.round(len / segLen));
  const pts = [[0, 0]];
  const angs = [ang];
  let a = ang, x = 0, y = 0;
  const curl = rng.range(-1, 1);
  for (let i = 1; i <= n; i++) {
    a += (rng.range(-0.2, 0.2) + curl * 0.03) * (depth === 0 ? 0.55 : 1);
    // 末梢舒展：向水平方向略微下垂，但不垂到水平以下太多
    if (depth >= 2) {
      a += 0.01 * depth * Math.cos(a);
      if (Math.sin(a) > 0.3) a -= 0.08 * Math.sign(Math.cos(a));
    }
    // 留在树冠包络里
    const gx = origin[0] + x, gy = origin[1] + y;
    if (depth >= 1 && insideCrown(gx, gy) > 1) {
      const toC = Math.atan2(CROWN.cy - gy, CROWN.cx - gx);
      let d = toC - a;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      a += d * 0.12;
    }
    x += Math.cos(a) * (len / n);
    y += Math.sin(a) * (len / n);
    pts.push([x, y]);
    angs.push(a);
  }
  const w1 = w0 * (opts.tipRatio ?? (depth === 0 ? 0.68 : depth === 1 ? 0.45 : 0.35));
  return { pts, angs, w0, w1, depth, len, children: [], foliage: [], seed: rng.range(0, 1000), at: 0, origin };
}

function widthAt(b, i) {
  const s = i / (b.pts.length - 1);
  return lerp(b.w0, b.w1, Math.pow(s, 0.8));
}

function growRec(rng, b, maxDepth) {
  const d = b.depth;
  if (d >= maxDepth) return;
  const nc = d === 1 ? 4 : d === 2 ? 3 : d === 3 ? 3 : 2;
  const used = [];
  for (let c = 0; c < nc; c++) {
    let at = rng.range(0.28, 0.95);
    if (c === nc - 1) at = 1.0;
    const idx = Math.min(b.pts.length - 1, Math.max(1, Math.round(at * (b.pts.length - 1))));
    if (used.includes(idx) && at < 1) continue;
    used.push(idx);
    const side = c % 2 === 0 ? 1 : -1;
    const spread = at === 1.0 ? rng.range(-0.3, 0.3) : side * rng.range(0.4, 0.95);
    const ang = b.angs[idx] + spread;
    const len = b.len * (at === 1.0 ? rng.range(0.6, 0.78) : rng.range(0.45, 0.72));
    const w = widthAt(b, idx) * (at === 1.0 ? 0.8 : rng.range(0.5, 0.68));
    const o = [b.origin[0] + b.pts[idx][0], b.origin[1] + b.pts[idx][1]];
    const ch = makeBranch(rng, ang, len, w, d + 1, o);
    ch.at = idx;
    b.children.push(ch);
    growRec(rng, ch, maxDepth);
  }
  if (d >= 2) {
    const step = d >= 4 ? 2 : 3;
    for (let i = Math.max(1, Math.floor(b.pts.length * 0.25)); i < b.pts.length; i += step) {
      b.foliage.push({ i, seed: rng.range(0, 1000), size: rng.range(0.75, 1.25) * (d >= 4 ? 0.9 : 1) });
    }
    b.foliage.push({ i: b.pts.length - 1, seed: rng.range(0, 1000), size: 1.15, tip: true });
  }
}

export function buildTree(seed = 5) {
  const rng = new Rng(seed);
  const trunk = makeBranch(rng, -Math.PI / 2 + 0.06, 150, 64, 0, [0, 0]);
  const limbs = [
    { at: 0.5, ang: -2.62, len: 250, wf: 0.5 },
    { at: 0.82, ang: -2.1, len: 255, wf: 0.58 },
    { at: 1.0, ang: -1.62, len: 230, wf: 0.62 },
    { at: 0.92, ang: -1.08, len: 265, wf: 0.6 },
    { at: 0.62, ang: -0.52, len: 245, wf: 0.48 },
  ];
  for (const L of limbs) {
    const idx = Math.round(L.at * (trunk.pts.length - 1));
    const o = [trunk.pts[idx][0], trunk.pts[idx][1]];
    const b = makeBranch(rng, L.ang + rng.range(-0.06, 0.06), L.len, widthAt(trunk, idx) * L.wf, 1, o);
    b.at = idx;
    trunk.children.push(b);
    growRec(rng, b, 5);
  }
  const all = [];
  (function walk(b) { b.id = all.length; all.push(b); b.children.forEach(walk); })(trunk);
  return { trunk, all, seed };
}

export const WIND = { dir: -1 };
function sway(b, t, wind) {
  const amp = wind * (0.002 + 0.005 * Math.pow(b.depth, 1.35));
  const gust = noise1(t * 0.32, 99) * 0.5 + 0.5;
  return amp * (noise1(t * 0.55 + b.seed, 7) * 0.65 + noise1(t * 1.7 + b.seed * 1.3, 8) * 0.35 + gust * 0.6 * WIND.dir);
}

function place(b, origin, acc, t, wind, out) {
  const ang = acc + sway(b, t, wind);
  const c = Math.cos(ang), s = Math.sin(ang);
  const W = new Array(b.pts.length);
  for (let i = 0; i < b.pts.length; i++) {
    const [x, y] = b.pts[i];
    W[i] = [origin[0] + x * c - y * s, origin[1] + x * s + y * c];
  }
  out.push({ b, W, rot: ang });
  for (const ch of b.children) place(ch, W[ch.at], ang, t, wind, out);
}

// 沿折线的法线偏移
function offsetLine(W, wf, k) {
  return W.map((p, i) => {
    const j = Math.min(i + 1, W.length - 1), h = Math.max(i - 1, 0);
    const dx = W[j][0] - W[h][0], dy = W[j][1] - W[h][1];
    const l = Math.hypot(dx, dy) || 1;
    let nx = -dy / l, ny = dx / l;
    if (nx + ny * 0.6 < 0) { nx = -nx; ny = -ny; } // 统一朝右下（背光面）
    const hw = wf(i / (W.length - 1)) * k;
    return [p[0] + nx * hw, p[1] + ny * hw];
  });
}

export class PearTree {
  constructor(root = [1290, 716], seed = 5, scale = 1) {
    this.root = root;
    this.scale = scale;
    this.T = buildTree(seed);
    this.placed = null;
  }
  layout(t, wind) {
    const out = [];
    place(this.T.trunk, [0, 0], 0, t, wind, out);
    this.placed = out;
    return out;
  }
  pointOn(id, s = 1) {
    const P = this.placed.find((p) => p.b.id === id);
    const i = Math.round(clamp(s) * (P.W.length - 1));
    return this.toWorld(P.W[i]);
  }
  toWorld(p) {
    return [this.root[0] + p[0] * this.scale, this.root[1] + p[1] * this.scale];
  }
  findBranchNear(x, y, minDepth = 2, maxDepth = 9) {
    if (!this.placed) this.layout(0, 0);
    let best = null, bd = Infinity;
    for (const P of this.placed) {
      if (P.b.depth < minDepth || P.b.depth > maxDepth) continue;
      for (let i = 0; i < P.W.length; i++) {
        const q = this.toWorld(P.W[i]);
        const d = Math.hypot(q[0] - x, q[1] - y);
        if (d < bd) { bd = d; best = { id: P.b.id, s: i / (P.W.length - 1) }; }
      }
    }
    return best;
  }

  /**
   * o: { wind, bloom 0..1, leaves 0..1, autumn 0..1, snow 0..1, inkAlpha, bloomWave }
   */
  draw(ctx, t, o = {}) {
    const wind = o.wind ?? 0.6;
    const placed = this.layout(t, wind);
    ctx.save();
    ctx.translate(this.root[0], this.root[1]);
    ctx.scale(this.scale, this.scale);
    ctx.globalCompositeOperation = 'multiply';
    const al = o.inkAlpha ?? 1;

    // 树根：向两侧扎进土里
    const rr = new Rng(this.T.seed + 3);
    for (let k = 0; k < 7; k++) {
      const dir = k % 2 ? -1 : 1;
      const sx = dir * rr.range(8, 30);
      stroke(ctx, [[sx * 0.5, -14], [sx + dir * rr.range(8, 18), 0], [sx + dir * rr.range(26, 58), rr.range(5, 11)]],
        { w: rr.range(7, 14), tone: 0.82, dry: 0.55, seed: 900 + k, alpha: 0.85 * al, taperIn: 0.05, taperOut: 0.75 });
    }

    // 枝干
    for (const { b, W } of placed) {
      const wf = (s) => lerp(b.w0, b.w1, Math.pow(s, 0.8));
      if (b.w0 >= 7) {
        // 侧锋干笔：一笔铺出枝干，墨色中等，飞白顺着枝干走
        stroke(ctx, W, { w: wf, tone: 0.66, dry: 0.42, seed: b.seed, alpha: 0.82 * al, taperIn: 0.0, taperOut: 0.1, fade: 0.05, wave: 0.12, bristles: Math.round(clamp(b.w0 / 1.3, 8, 40)) });
        // 背光一侧的焦墨
        stroke(ctx, offsetLine(W, wf, 0.3), { w: (s) => wf(s) * 0.4, tone: 0.95, dry: 0.55, seed: b.seed + 5, alpha: 0.85 * al, taperIn: 0.05, taperOut: 0.3 });
        // 树皮横纹与树疤
        const kr = new Rng(b.seed);
        const marks = Math.floor(b.len / 22);
        for (let k = 0; k < marks; k++) {
          const i = Math.floor(kr.range(0.05, 0.9) * (W.length - 1));
          const j = Math.min(i + 1, W.length - 1);
          const dx = W[j][0] - W[i][0], dy = W[j][1] - W[i][1];
          const l = Math.hypot(dx, dy) || 1;
          const nx = -dy / l, ny = dx / l;
          const hw = wf(i / (W.length - 1)) * 0.5;
          const u0 = kr.range(-0.6, 0.2), u1 = u0 + kr.range(0.25, 0.6);
          const p = W[i];
          const bow = kr.range(-3, 3);
          stroke(ctx, [[p[0] + nx * hw * u0, p[1] + ny * hw * u0], [p[0] + nx * hw * (u0 + u1) / 2 + (dx / l) * bow, p[1] + ny * hw * (u0 + u1) / 2 + (dy / l) * bow], [p[0] + nx * hw * u1, p[1] + ny * hw * u1]],
            { w: kr.range(1.2, 2.6), tone: 0.92, dry: 0.3, alpha: 0.7 * al, seed: b.seed + k, taperIn: 0.3, taperOut: 0.4 });
        }
        const knots = Math.floor(b.len / 80);
        for (let k = 0; k < knots; k++) {
          const i = Math.floor(kr.range(0.15, 0.85) * (W.length - 1));
          const p = W[i];
          blob(ctx, p[0] + kr.range(-0.15, 0.15) * b.w0, p[1], kr.range(0.1, 0.18) * b.w0, { tone: 0.92, alpha: 0.75 * al, sy: 0.55, angle: kr.range(0, 3), seed: b.seed + k });
        }
      } else {
        stroke(ctx, W, { w: wf, tone: b.depth >= 4 ? 0.78 : 0.86, dry: b.w0 > 3.5 ? 0.4 : 0.15, seed: b.seed, alpha: 0.92 * al, taperIn: 0.02, taperOut: 0.55 });
      }
    }

    const snow = o.snow ?? 0;
    if (snow > 0.01) this.drawSnow(ctx, placed, snow);
    const leaves = o.leaves ?? 0;
    if (leaves > 0.01) this.drawLeaves(ctx, placed, leaves, o.autumn ?? 0, t);
    const bloom = o.bloom ?? 0;
    if (bloom > 0.01) this.drawBlossoms(ctx, placed, bloom, t, o);
    ctx.restore();
  }

  drawSnow(ctx, placed, amt) {
    const W8 = whiteOf(ctx);
    for (const { b, W } of placed) {
      if (b.depth >= 5) continue;
      const wf = (s) => lerp(b.w0, b.w1, Math.pow(s, 0.8));
      let run = [];
      const flush = () => {
        if (run.length > 2) {
          const top = run.map((q) => [q[0], q[1] - q[2] * 0.42]);
          const wfn = (s) => (run[Math.round(s * (run.length - 1))][2] * 0.55 + 2.4) * amt;
          if (W8) stroke(W8, top, { w: wfn, color: [255, 255, 255], alpha: 0.95, dry: 0, body: 1, taperIn: 0.3, taperOut: 0.3, wobble: 0.35, seed: b.seed + 3 });
          stroke(ctx, run.map((q) => [q[0], q[1] - q[2] * 0.1]), { w: 1.0, tone: 0.4, alpha: 0.45 * amt, dry: 0, taperIn: 0.3, taperOut: 0.3, seed: b.seed + 4 });
        }
        run = [];
      };
      for (let i = 0; i < W.length; i++) {
        const j = Math.min(i + 1, W.length - 1), h = Math.max(i - 1, 0);
        const dx = W[j][0] - W[h][0], dy = W[j][1] - W[h][1];
        const horiz = Math.abs(dx) / (Math.hypot(dx, dy) || 1);
        if (horiz > 0.42 && hash(b.seed, Math.floor(i / 5)) < 0.88) run.push([W[i][0], W[i][1], wf(i / (W.length - 1))]);
        else flush();
      }
      flush();
      if (W8) {
        for (const f of b.foliage) {
          if (hash(f.seed, 3) > 0.22 * amt || !f.tip) continue;
          const p = W[f.i];
          blob(W8, p[0], p[1] - 2.5, 3.6 * f.size * amt + 1, { fill: 'rgba(255,255,255,0.95)', sx: 1.4, sy: 0.45, rough: 0.35, seed: f.seed });
          blob(ctx, p[0], p[1] + 0.5, 3.0 * f.size * amt, { fill: rgba(inkRGB(0.3), 0.15), sx: 1.4, sy: 0.3, seed: f.seed + 1 });
        }
      }
    }
  }

  drawLeaves(ctx, placed, amt, autumn, t) {
    for (const { b, W } of placed) {
      for (const f of b.foliage) {
        const h = hash(f.seed, 11);
        if (h > amt) continue;
        const p = W[f.i];
        const n = Math.round(5 + f.size * 7 * (1 - autumn * 0.35));
        for (let k = 0; k < n; k++) {
          const a = hash(f.seed, k) * TAU;
          const r = 3 + hash(f.seed, k + 50) * 14 * f.size;
          const x = p[0] + Math.cos(a) * r, y = p[1] + Math.sin(a) * r * 0.75 - 2;
          let col;
          if (autumn > 0) {
            const q = hash(f.seed, k + 90);
            col = q < 0.5 ? C.autumnOchre : q < 0.68 ? C.autumnRust : C.autumnPale;
            col = col.map((v, i) => lerp(C.summerGreen[i], v, autumn));
          } else col = hash(f.seed, k + 70) < 0.6 ? C.summerGreen : C.summerDeep;
          const al = autumn > 0 ? 0.32 + hash(f.seed, k + 7) * 0.3 : 0.22 + hash(f.seed, k + 7) * 0.26;
          blob(ctx, x, y, 3.8 + hash(f.seed, k + 30) * 3.4, { fill: rgba(col, al), sx: 1.5, sy: 0.72, angle: a + noise1(t * 0.8 + k, f.seed) * 0.3, rough: 0.15, seed: f.seed + k });
        }
      }
    }
  }

  drawBlossoms(ctx, placed, amt, t, o) {
    const wave = o.bloomWave;
    const flowers = [];
    const clusters = [];
    for (const { b, W } of placed) {
      for (const f of b.foliage) {
        const p = W[f.i];
        let open = amt;
        if (wave !== undefined) {
          const wx = p[0], wy = p[1];
          const d = clamp((-wy) / 470) * 0.55 + clamp(Math.abs(wx) / 420) * 0.3 + hash(f.seed, 21) * 0.2;
          open = smoothstep(d - 0.12, d + 0.08, wave * 1.15) * amt;
        }
        if (open <= 0.01 || hash(f.seed, 5) > 0.95) continue;
        const n = f.tip ? 6 : 3 + Math.floor(hash(f.seed, 6) * 4);
        const R = (6 + hash(f.seed, 8) * 8) * f.size;
        clusters.push({ x: p[0], y: p[1], R, open, seed: f.seed });
        for (let k = 0; k < n; k++) {
          const a = hash(f.seed, k + 1) * TAU;
          const r = (k === 0 ? 0 : 0.35 + hash(f.seed, k + 40) * 0.75) * R;
          const x = p[0] + Math.cos(a) * r, y = p[1] + Math.sin(a) * r * 0.8 - 2;
          const pr = (2.6 + hash(f.seed, k + 60) * 1.6) * f.size * (0.35 + 0.65 * open);
          flowers.push({ x, y, pr, rot: hash(f.seed, k + 80) * TAU + noise1(t * 0.9 + k, f.seed) * 0.15, seed: f.seed + k, open });
        }
      }
    }
    // 1) 花团下的淡墨淡绿晕，让白花从纸上“托”出来
    for (const c of clusters) softDot(ctx, c.x, c.y - 1, c.R * 1.7, [196, 204, 186], 0.22 * c.open, 0.82);
    // 2) 嫩叶
    for (const c of clusters) {
      for (let k = 0; k < 2; k++) {
        const a = hash(c.seed, k + 200) * TAU;
        blob(ctx, c.x + Math.cos(a) * c.R * 0.9, c.y + Math.sin(a) * c.R * 0.6, 2.4 + hash(c.seed, k) * 1.6, { fill: rgba(C.springLeaf, 0.5 * c.open), sx: 1.6, sy: 0.7, angle: a, seed: c.seed + k });
      }
    }
    // 3) 白粉花瓣
    const W8 = whiteOf(ctx);
    if (W8) {
      W8.beginPath();
      for (const F of flowers) {
        for (let k = 0; k < 5; k++) {
          const a = F.rot + (k / 5) * TAU;
          const cx = F.x + Math.cos(a) * F.pr * 0.55, cy = F.y + Math.sin(a) * F.pr * 0.55;
          W8.moveTo(cx + F.pr * 0.56, cy);
          W8.arc(cx, cy, F.pr * 0.56, 0, TAU);
        }
      }
      W8.fillStyle = 'rgba(255,255,255,0.92)';
      W8.fill();
    }
    // 4) 极淡的花瓣轮廓 + 花蕊
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = rgba(inkRGB(0.35), 0.35);
    ctx.beginPath();
    for (const F of flowers) {
      if (F.pr < 2.2) continue;
      for (let k = 0; k < 5; k++) {
        const a = F.rot + (k / 5) * TAU;
        const cx = F.x + Math.cos(a) * F.pr * 0.55, cy = F.y + Math.sin(a) * F.pr * 0.55;
        ctx.moveTo(cx + Math.cos(a - 0.9) * F.pr * 0.56, cy + Math.sin(a - 0.9) * F.pr * 0.56);
        ctx.arc(cx, cy, F.pr * 0.56, a - 0.9, a + 0.9);
      }
    }
    ctx.stroke();
    for (const F of flowers) {
      softDot(ctx, F.x, F.y, F.pr * 0.45, [214, 210, 150], 0.5 * F.open);
      for (let k = 0; k < 4; k++) {
        const a = hash(F.seed, k) * TAU;
        blob(ctx, F.x + Math.cos(a) * F.pr * 0.28, F.y + Math.sin(a) * F.pr * 0.28, Math.max(0.3, F.pr * 0.09), { tone: 0.9, alpha: 0.85 * F.open, sides: 6, seed: F.seed + k });
      }
    }
  }
}
