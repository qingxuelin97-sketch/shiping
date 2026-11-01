// 通用数学：插值、缓动、关键帧轨道、几何小工具
export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => (b === a ? 0 : (x - a) / (b - a));
export const remap = (x, a, b, c, d, cl = true) => {
  let t = invLerp(a, b, x);
  if (cl) t = clamp(t);
  return lerp(c, d, t);
};
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const fract = (x) => x - Math.floor(x);
export const deg = (d) => (d * Math.PI) / 180;

export const Ease = {
  linear: (t) => t,
  step: (t) => (t < 1 ? 0 : 1),
  hold: () => 0,
  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: (t) => t * t * t * t,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  inOutBack: (t) => {
    const c1 = 1.70158, c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
  outElastic: (t) => {
    const c4 = TAU / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  // 表演用：先反向预备一下，再过冲、回稳
  anticip: (t) => {
    const a = 0.22;
    if (t < a) return -0.1 * Math.sin((t / a) * Math.PI);
    const u = (t - a) / (1 - a);
    const c1 = 1.4, c3 = c1 + 1;
    return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
  },
  // 过冲后轻微回弹
  settle: (t) => (t >= 1 ? 1 : 1 - Math.exp(-6.5 * t) * Math.cos(8.5 * t)),
};

// 数字、数组、对象逐分量插值
export function mixv(a, b, t) {
  if (typeof a === 'number') return a + (b - a) * t;
  if (Array.isArray(a)) return a.map((v, i) => mixv(v, b[i], t));
  if (a && typeof a === 'object') {
    const o = {};
    for (const k in a) o[k] = k in b ? mixv(a[k], b[k], t) : a[k];
    for (const k in b) if (!(k in a)) o[k] = b[k];
    return o;
  }
  return t < 0.5 ? a : b;
}

// 关键帧轨道：keys = [[t, value, ease?], ...]，ease 作用于从这一帧到下一帧的区间
export function track(keys, t) {
  if (!keys.length) return undefined;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0, e] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t < t1) {
      const ease = typeof e === 'function' ? e : Ease[e || 'inOutSine'];
      return mixv(v0, v1, ease(invLerp(t0, t1, t)));
    }
  }
  return keys[keys.length - 1][1];
}

// 0→1→0 的包络：在 [a,b] 内为 1，前后分别用 fi / fo 秒淡入淡出
export function envelope(t, a, b, fi = 0.5, fo = 0.5) {
  if (t < a - fi || t > b + fo) return 0;
  if (t < a) return Ease.inOutSine(clamp((t - (a - fi)) / fi));
  if (t > b) return 1 - Ease.inOutSine(clamp((t - b) / fo));
  return 1;
}

// 区间进度（带缓动）
export function prog(t, a, b, ease = 'inOutSine') {
  return Ease[ease](clamp(invLerp(a, b, t)));
}

// ---------- 几何 ----------
export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const scl = (a, s) => [a[0] * s, a[1] * s];
export const rot = (p, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};
export const polar = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
export const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function quadPt(p0, p1, p2, t) {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}
export function cubicPt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}
// Catmull-Rom 样条采样，pts 为控制点，返回密集点列
export function spline(pts, perSeg = 12) {
  if (pts.length < 3) return pts.slice();
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
// 按弧长重采样
export function resample(pts, spacing) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = dist(a, b);
    let d = spacing - carry;
    while (d <= seg) {
      out.push(lerp2(a, b, d / seg));
      d += spacing;
    }
    carry = seg - (d - spacing);
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) > spacing * 0.25) out.push(last);
  return out;
}
export function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}
// 沿折线取参数 s∈[0,1] 处的点和切向角
export function along(pts, s) {
  const L = pathLength(pts);
  let target = clamp(s) * L;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (target <= d || i === pts.length - 1) {
      const t = d > 0 ? clamp(target / d) : 0;
      const p = lerp2(pts[i - 1], pts[i], t);
      const ang = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
      return { p, ang };
    }
    target -= d;
  }
  return { p: pts[pts.length - 1], ang: 0 };
}
