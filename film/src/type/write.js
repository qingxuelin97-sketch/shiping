// 按真实笔顺书写汉字（笔画数据：Make Me a Hanzi，Arphic 公共许可）。
// 每一笔沿中线逐渐“写出”：用沿中线排开的一串圆作裁剪区，露出这一笔的轮廓；
// 起笔处墨重一点，边缘一圈淡墨晕（洇墨）。字框 1024，y 朝上，显示时 y' = 900 - y。
import STROKES from './strokes.js';
import { clamp } from '../core/math.js';
import { rgba, inkRGB } from '../ink/brush.js';

const CACHE = new Map();

function charData(ch) {
  if (CACHE.has(ch)) return CACHE.get(ch);
  const d = STROKES[ch];
  if (!d) return null;
  const strokes = d.strokes.map((svg, i) => {
    const med = d.medians[i];
    let L = 0;
    const acc = [0];
    for (let k = 1; k < med.length; k++) {
      L += Math.hypot(med[k][0] - med[k - 1][0], med[k][1] - med[k - 1][1]);
      acc.push(L);
    }
    return { path: new Path2D(svg), med, acc, L: Math.max(L, 1) };
  });
  // 每一笔占用的时间：与中线长度成正比，再加一点停顿（提笔、换笔）
  const PAUSE = 90;
  const total = strokes.reduce((s, k) => s + k.L + PAUSE, 0);
  let t = 0;
  for (const s of strokes) {
    s.t0 = t / total;
    t += s.L;
    s.t1 = t / total;
    t += PAUSE;
  }
  const out = { strokes };
  CACHE.set(ch, out);
  return out;
}

export function strokeCount(ch) {
  const d = charData(ch);
  return d ? d.strokes.length : 0;
}

// 中线上弧长 s 处的点
function pointAt(st, s) {
  const { med, acc } = st;
  for (let k = 1; k < med.length; k++) {
    if (s <= acc[k] || k === med.length - 1) {
      const seg = acc[k] - acc[k - 1] || 1;
      const u = clamp((s - acc[k - 1]) / seg);
      return [med[k - 1][0] + (med[k][0] - med[k - 1][0]) * u, med[k - 1][1] + (med[k][1] - med[k - 1][1]) * u];
    }
  }
  return med[med.length - 1];
}

/**
 * 在 (x, y)（字框中心）写一个字，字框边长 size；p 为这个字的书写进度 0..1。
 * o: { tone 墨色, alpha, halo 洇墨强度 }
 */
export function writeChar(ctx, ch, x, y, size, p, o = {}) {
  const d = charData(ch);
  if (!d || p <= 0) return;
  const k = size / 1024;
  const col = o.color || inkRGB(o.tone ?? 0.92);
  const alpha = o.alpha ?? 1;
  const halo = o.halo ?? 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, -k);
  ctx.translate(-512, -388);
  ctx.globalCompositeOperation = 'multiply';
  for (const st of d.strokes) {
    const q = clamp((p - st.t0) / (st.t1 - st.t0));
    if (q <= 0) break;
    ctx.save();
    if (q < 1) {
      // 已经写到的那一段：沿中线排开的圆的并集
      const clip = new Path2D();
      const upto = q * st.L;
      const R = 74;
      for (let s = 0; s <= upto; s += 14) {
        const [px, py] = pointAt(st, s);
        clip.moveTo(px + R, py);
        clip.arc(px, py, R, 0, Math.PI * 2);
      }
      const [ex, ey] = pointAt(st, upto);
      clip.moveTo(ex + R, ey);
      clip.arc(ex, ey, R, 0, Math.PI * 2);
      ctx.clip(clip);
    }
    // 洇墨：一圈由宽到窄的淡墨描边
    if (halo > 0) {
      ctx.lineJoin = 'round';
      for (const [w, a] of [[34, 0.05], [20, 0.07], [10, 0.09]]) {
        ctx.lineWidth = w;
        ctx.strokeStyle = rgba(col, a * halo * alpha);
        ctx.stroke(st.path);
      }
    }
    ctx.fillStyle = rgba(col, 0.96 * alpha);
    ctx.fill(st.path);
    // 起笔处的墨团（顿笔）
    ctx.clip(st.path);
    const [sx, sy] = st.med[0];
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 70);
    g.addColorStop(0, rgba(col, 0.35 * alpha));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(sx - 80, sy - 80, 160, 160);
    ctx.restore();
  }
  ctx.restore();
}

// 竖排一行字，按顺序一个字一个字写；p 为整行进度
export function writeColumn(ctx, text, x, y, size, step, p, o = {}) {
  const chars = [...text];
  const n = chars.length;
  // 每个字占用的时间按笔画数分配
  const w = chars.map((c) => strokeCount(c) + 2);
  const tot = w.reduce((a, b) => a + b, 0);
  let acc = 0;
  chars.forEach((c, i) => {
    const a = acc / tot, b = (acc + w[i]) / tot;
    acc += w[i];
    const q = clamp((p - a) / (b - a));
    if (q > 0) writeChar(ctx, c, x, y + i * step, size, q, o);
  });
  return n;
}
