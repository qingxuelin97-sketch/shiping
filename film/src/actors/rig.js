// 参数化人物骨骼 + 水墨卡通画法（v2）。所有角色共用：爷爷、小燕（各年龄）、女儿。
// 角度单位：弧度。0 = 肢体自然下垂；正值 = 朝面向方向前摆。膝盖正值 = 小腿向后弯；foot 正值 = 脚尖向下。
//
// v2 的变化：
//   画法：变宽墨线（背光侧更粗）、淡墨明暗、立领对襟、盘扣、袖口裤脚、白底布鞋、带拇指的手、
//         眉毛表情、眼睛高光、眨眼、耳朵、发丝、爷爷的长须与皱纹、脚下接触影
//   表演：待机呼吸与重心轻移、按速度滞后摆动的头绳/马尾/衣摆、关键姿势插值的走跑循环
import { stroke, blob, rgba, inkRGB, softDot, whiteOf, line, bgOf } from '../ink/brush.js';
import { lerp, clamp, TAU, mixv } from '../core/math.js';
import { noise1, hash } from '../core/noise.js';
import { C } from '../world/palette.js';

const colOf = (c) => (Array.isArray(c) ? c : inkRGB(c));
const darker = (c, k) => c.map((v) => v * k);
const lighter = (c, k) => c.map((v) => v + (255 - v) * k);
const SHADE_CLOTH = [118, 124, 142];
const SHADE_SKIN = [214, 168, 150];
const INK_LINE = 0.9;

// 表情预设：眉毛抬高、眉尾角度、嘴形
export const EXPR = {
  neutral: { brow: 0, tilt: 0, mouth: 'line' },
  happy: { brow: 0.08, tilt: 0.05, mouth: 'smile' },
  joy: { brow: 0.22, tilt: 0.08, mouth: 'open' },
  laugh: { brow: 0.2, tilt: 0.12, mouth: 'grin', squint: true },
  surprised: { brow: 0.42, tilt: 0, mouth: 'O' },
  sad: { brow: 0.06, tilt: -0.38, mouth: 'sad' },
  tender: { brow: 0.04, tilt: -0.15, mouth: 'smile' },
  sleepy: { brow: -0.04, tilt: -0.08, mouth: 'line', eyesClosed: true },
  focused: { brow: -0.08, tilt: 0.18, mouth: 'line' },
};

export class Figure {
  constructor(spec) {
    this.s = spec;
    const H = spec.height;
    const k = spec.child
      ? { neck: 0.03, torso: 0.27, ua: 0.15, fa: 0.13, th: 0.2, sh: 0.19, foot: 0.085 }
      : { neck: 0.035, torso: 0.3, ua: 0.17, fa: 0.15, th: 0.235, sh: 0.225, foot: 0.075 };
    this.L = { H, headR: spec.headR, neck: k.neck * H, torso: k.torso * H, ua: k.ua * H, fa: k.fa * H, th: k.th * H, sh: k.sh * H, foot: k.foot * H, ankle: 0.028 * H };
    this.seed = hash(H, spec.headR * 13) * 100;
  }

  // ---------- 骨骼 ----------
  joints(p) {
    const f = p.facing ?? 1;
    const L = this.L;
    const down = (a) => [f * Math.sin(a), Math.cos(a)];
    const up = (a) => [f * Math.sin(a), -Math.cos(a)];
    const add = (a, v, l) => [a[0] + v[0] * l, a[1] + v[1] * l];
    const legs = {};
    for (const side of ['F', 'B']) {
      const [h, k] = p['leg' + side] || [0, 0];
      const hip = [f * (side === 'F' ? 1 : -1) * L.H * 0.012, 0];
      const knee = add(hip, down(h), L.th);
      const ankle = add(knee, down(h - k), L.sh);
      const toe = add(ankle, down(h - k + Math.PI / 2 - (p['foot' + side] || 0)), L.foot);
      legs[side] = { hip, knee, ankle, toe };
    }
    // 着地：脚踝底或脚尖，取最低者
    const lowest = Math.max(legs.F.ankle[1] + L.ankle, legs.B.ankle[1] + L.ankle, legs.F.toe[1] + L.ankle * 0.3, legs.B.toe[1] + L.ankle * 0.3);
    const hipY = p.sit != null ? p.y - p.sit : p.y - lowest - (p.lift || 0);
    const lean = p.lean || 0;
    const hd = p.head || 0;
    const chest = add([0, 0], up(lean), L.torso);
    const neck = add(chest, up(lean * 0.6 + hd * 0.3), L.neck);
    const head = add(neck, up(lean * 0.4 + hd), L.headR * 0.92);
    const shoulder = add(chest, down(lean), L.torso * 0.08 - (p.shrug || 0) * L.H * 0.02);
    const arms = {};
    for (const side of ['F', 'B']) {
      const [s, e] = p['arm' + side] || [0, 0];
      const sh = [shoulder[0] + f * (side === 'F' ? 0.6 : -1.2) * L.H * 0.012, shoulder[1]];
      const elbow = add(sh, down(s + lean * 0.5), L.ua);
      const wrist = add(elbow, down(s + e + lean * 0.5), L.fa);
      const hand = add(wrist, down(s + e + lean * 0.5), L.headR * 0.3);
      arms[side] = { sh, elbow, wrist, hand, ang: s + e + lean * 0.5 };
    }
    const O = [p.x, hipY];
    const T = (q) => [q[0] + O[0], q[1] + O[1]];
    return {
      f, hip: T([0, 0]), chest: T(chest), neck: T(neck), head: T(head), shoulder: T(shoulder), lean, hd,
      legF: { hip: T(legs.F.hip), knee: T(legs.F.knee), ankle: T(legs.F.ankle), toe: T(legs.F.toe) },
      legB: { hip: T(legs.B.hip), knee: T(legs.B.knee), ankle: T(legs.B.ankle), toe: T(legs.B.toe) },
      armF: { sh: T(arms.F.sh), elbow: T(arms.F.elbow), wrist: T(arms.F.wrist), hand: T(arms.F.hand), ang: arms.F.ang },
      armB: { sh: T(arms.B.sh), elbow: T(arms.B.elbow), wrist: T(arms.B.wrist), hand: T(arms.B.hand), ang: arms.B.ang },
    };
  }

  // 待机：呼吸、头部微动、重心轻移（不改变镜头给的大动作）
  idle(p, t) {
    if (p.idle === false) return p;
    const s = this.seed;
    const amt = p.moving ? 0.25 : 1;
    const per = this.s.breath ?? (this.s.child ? 3.0 : this.s.style === 'grandpa' ? 4.4 : 3.7);
    const br = Math.sin(((t + s) * TAU) / per);
    const q = { ...p };
    q.lean = (p.lean || 0) + br * 0.012 * amt;
    q.head = (p.head || 0) + (noise1(t * 0.42, s) * 0.035 - br * 0.008) * amt;
    q.shrug = (p.shrug || 0) + (br * 0.5 + 0.5) * 0.25 * amt;
    if (p.armF) q.armF = [p.armF[0] + br * 0.018 * amt, p.armF[1] + br * 0.012 * amt];
    if (p.armB) q.armB = [p.armB[0] + br * 0.014 * amt, p.armB[1]];
    if (p.sit == null && !p.moving) q.x = p.x + noise1(t * 0.22, s + 3) * this.L.H * 0.005 * amt;
    return q;
  }

  // 眨眼：约 2.5–5 秒一次，持续 3 帧
  blinking(t) {
    const w = 3.6;
    const k = Math.floor((t + this.seed) / w);
    for (const kk of [k, k - 1]) {
      const at = kk * w + 0.4 + hash(this.seed, kk) * (w - 0.8);
      if (t + this.seed >= at && t + this.seed < at + 0.125) return true;
    }
    return false;
  }

  draw(ctx, p0, t = 0) {
    const p = this.idle(p0, t);
    const J = this.joints(p);
    this.a = p.alpha ?? 1;
    this.ctx = ctx;
    this.W8 = whiteOf(ctx);
    const m = ctx.getTransform();
    this.vs = Math.hypot(m.a, m.b) / (ctx.base || 1); // 世界单位 → 屏幕虚拟像素
    this.rv = this.L.headR * this.vs; // 头半径在屏幕上的虚拟像素
    this.v = p.v || [0, 0];
    this.t = t;
    ctx.save();
    if (!p.noShadow) this.drawShadow(J, p);
    if (this.s.backpack) this.drawBackpack(J);
    if (!p.armBFront) this.drawArm(J, 'B', true, p);
    // 两条腿都在衣服之前画：上衣下摆盖住大腿根
    this.drawLeg(J, 'B', true);
    this.drawLeg(J, 'F', false);
    this.drawBody(J, p, t);
    if (p.armFBehind) this.drawArm(J, 'F', false, p);
    this.drawHead(J, p, t);
    if (!p.armFBehind) this.drawArm(J, 'F', false, p);
    if (p.armBFront) this.drawArm(J, 'B', true, p);
    ctx.restore();
    return J;
  }

  // ---------- 基础画法 ----------
  // 线宽：随镜头远近适度变化，近景不至于过粗
  lw(k) {
    const px = clamp(this.L.H * k * this.vs, 1.0, 6.5);
    return px / this.vs;
  }
  fillPath(path, col, alpha = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = this.a * alpha;
    ctx.fillStyle = rgba(col, 1);
    ctx.fill(path);
    ctx.restore();
    if (this.W8) {
      const W = this.W8;
      W.setTransform(ctx.getTransform());
      W.save();
      W.globalCompositeOperation = 'destination-out';
      W.globalAlpha = this.a * alpha;
      W.fillStyle = '#000';
      W.fill(path);
      W.restore();
    }
  }
  outline(pts, w, tone = INK_LINE, seed = 1, taper = 0.15) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    stroke(ctx, pts, { w, tone, alpha: 0.92 * this.a, dry: 0.08, body: 1, taperIn: taper, taperOut: taper * 1.5, seed, wobble: 0.18, fade: 0 });
    ctx.restore();
  }
  // 背光一侧的淡墨晕染（a 为受光侧点，b 为背光侧点）
  shadeAcross(path, a, b, col, k = 0.3) {
    const ctx = this.ctx;
    ctx.save();
    ctx.clip(path);
    const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    g.addColorStop(0, rgba(col, 0));
    g.addColorStop(0.5, rgba(col, k * 0.25));
    g.addColorStop(1, rgba(col, k));
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = this.a;
    ctx.fillStyle = g;
    ctx.fill(path);
    ctx.restore();
  }
  capsule(bones, widths) {
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
    const e = bones[n - 1], d0 = [e[0] - bones[n - 2][0], e[1] - bones[n - 2][1]];
    const ang = Math.atan2(d0[1], d0[0]);
    path.arc(e[0], e[1], widths[n - 1] / 2, ang - Math.PI / 2, ang + Math.PI / 2);
    for (let i = n - 1; i >= 0; i--) path.lineTo(R[i][0], R[i][1]);
    const s0 = bones[0], d1 = [bones[1][0] - s0[0], bones[1][1] - s0[1]];
    const ang0 = Math.atan2(d1[1], d1[0]);
    path.arc(s0[0], s0[1], widths[0] / 2, ang0 + Math.PI / 2, ang0 + Math.PI * 1.5);
    path.closePath();
    return { path, L, R };
  }
  // 哪一侧是背光侧：法线朝向“面向的反方向/下方”的一侧
  backSide(cap, f) {
    const a = cap.L[Math.floor(cap.L.length / 2)], b = cap.R[Math.floor(cap.R.length / 2)];
    const score = (q, o) => (q[0] - o[0]) * -f + (q[1] - o[1]) * 0.35;
    return score(a, b) > 0 ? 'L' : 'R';
  }

  // ---------- 接触影 ----------
  drawShadow(J, p) {
    const B = bgOf(this.ctx);
    const H = this.L.H;
    const lift = p.lift || 0;
    const k = 1 / (1 + lift / (H * 0.12));
    const x0 = Math.min(J.legF.ankle[0], J.legB.ankle[0], J.legF.toe[0], J.legB.toe[0]);
    const x1 = Math.max(J.legF.ankle[0], J.legB.ankle[0], J.legF.toe[0], J.legB.toe[0]);
    const cx = (x0 + x1) / 2;
    const w = (x1 - x0) * 0.6 + H * (p.sit != null ? 0.26 : 0.17);
    B.save();
    B.globalCompositeOperation = 'multiply';
    softDot(B, cx, p.y + H * 0.006, w * k, inkRGB(0.6), 0.42 * k * this.a, 0.18);
    softDot(B, cx, p.y + H * 0.003, w * 0.55 * k, inkRGB(0.75), 0.3 * k * this.a, 0.16);
    B.restore();
  }

  // ---------- 腿与布鞋 ----------
  drawLeg(J, side, back) {
    const s = this.s, L = this.L, H = L.H, f = J.f;
    const g = J['leg' + side];
    const k = s.child ? 1.2 : 1;
    const base = colOf(s.trousers ?? 0.45);
    const col = back ? darker(base, 0.88) : base;
    const cap = this.capsule([g.hip, g.knee, g.ankle], [H * 0.1 * k, H * 0.08 * k, H * 0.072 * k]);
    this.fillPath(cap.path, col);
    const bs = this.backSide(cap, f);
    const mid = Math.floor(cap.L.length / 2);
    const lit = bs === 'L' ? cap.R[mid] : cap.L[mid], dark = bs === 'L' ? cap.L[mid] : cap.R[mid];
    this.shadeAcross(cap.path, lit, dark, SHADE_CLOTH, back ? 0.42 : 0.32);
    this.outline(bs === 'L' ? cap.L : cap.R, this.lw(0.019), INK_LINE, 11 + (side === 'F' ? 0 : 7));
    this.outline(bs === 'L' ? cap.R : cap.L, this.lw(0.011), INK_LINE, 12 + (side === 'F' ? 0 : 7));
    // 裤脚
    const dir = [g.ankle[0] - g.knee[0], g.ankle[1] - g.knee[1]];
    const dl = Math.hypot(dir[0], dir[1]) || 1;
    const nx = -dir[1] / dl, ny = dir[0] / dl;
    const hw = H * 0.042 * k;
    const c0 = [g.ankle[0] - (dir[0] / dl) * H * 0.02, g.ankle[1] - (dir[1] / dl) * H * 0.02];
    this.outline([[c0[0] + nx * hw, c0[1] + ny * hw], [c0[0] - nx * hw, c0[1] - ny * hw]], this.lw(0.009), 0.8, 15, 0.05);
    this.drawShoe(g, k, f);
  }
  drawShoe(g, k, f) {
    const s = this.s, H = this.L.H;
    const u0 = [g.toe[0] - g.ankle[0], g.toe[1] - g.ankle[1]];
    const ul = Math.hypot(u0[0], u0[1]) || 1;
    const u = [u0[0] / ul, u0[1] / ul];
    // 鞋面朝上的法线
    let n = [-u[1], u[0]];
    if (n[1] > 0) n = [-n[0], -n[1]];
    const len = this.L.foot * 1.12 * k, hgt = H * 0.04 * k, sole = H * 0.013 * k;
    const heel = [g.ankle[0] - u[0] * len * 0.22, g.ankle[1] - u[1] * len * 0.22 + H * 0.004];
    const P = (a, b) => [heel[0] + u[0] * a + n[0] * b, heel[1] + u[1] * a + n[1] * b];
    const upper = new Path2D();
    const pts = [P(0, 0), P(len * 0.04, hgt * 0.9), P(len * 0.45, hgt * 1.05), P(len * 0.85, hgt * 0.75), P(len * 1.02, hgt * 0.25), P(len, 0)];
    upper.moveTo(pts[0][0], pts[0][1]);
    for (const q of pts) upper.lineTo(q[0], q[1]);
    upper.closePath();
    this.fillPath(upper, colOf(s.shoes ?? 0.92));
    const so = new Path2D();
    const sp = [P(-len * 0.02, 0), P(len * 1.03, 0), P(len * 1.0, -sole), P(0, -sole)];
    so.moveTo(sp[0][0], sp[0][1]);
    for (const q of sp) so.lineTo(q[0], q[1]);
    so.closePath();
    this.fillPath(so, [246, 242, 232]);
    this.outline([...sp, sp[0]], this.lw(0.008), 0.85, 17, 0);
  }

  // ---------- 手臂与手 ----------
  drawArm(J, side, back, p) {
    const s = this.s, L = this.L, H = L.H, f = J.f;
    const g = J['arm' + side];
    const k = s.child ? 1.2 : 1;
    const base = colOf(s.sleeve ?? s.jacket ?? 0.7);
    const col = back ? darker(base, 0.88) : base;
    const cap = this.capsule([g.sh, g.elbow, g.wrist], [H * 0.1 * k, H * 0.08 * k, H * 0.094 * k]);
    this.fillPath(cap.path, col);
    const bs = this.backSide(cap, f);
    const mid = Math.floor(cap.L.length / 2);
    const lit = bs === 'L' ? cap.R[mid] : cap.L[mid], dark = bs === 'L' ? cap.L[mid] : cap.R[mid];
    this.shadeAcross(cap.path, lit, dark, SHADE_CLOTH, back ? 0.4 : 0.28);
    this.outline(bs === 'L' ? cap.L : cap.R, this.lw(0.017), INK_LINE, 41 + (side === 'F' ? 0 : 5));
    this.outline(bs === 'L' ? cap.R : cap.L, this.lw(0.01), INK_LINE, 42 + (side === 'F' ? 0 : 5));
    // 肘部衣褶
    const e = g.elbow;
    const d1 = [g.wrist[0] - g.sh[0], g.wrist[1] - g.sh[1]];
    const dl = Math.hypot(d1[0], d1[1]) || 1;
    if (this.vs * H > 60) {
      const nx = -d1[1] / dl, ny = d1[0] / dl;
      this.outline([[e[0] + nx * H * 0.02, e[1] + ny * H * 0.02], [e[0] + nx * H * 0.005 + (d1[0] / dl) * H * 0.012, e[1] + ny * H * 0.005 + (d1[1] / dl) * H * 0.012]], this.lw(0.007), 0.75, 44, 0.3);
    }
    // 袖口翻边
    const dw = [g.wrist[0] - g.elbow[0], g.wrist[1] - g.elbow[1]];
    const wl = Math.hypot(dw[0], dw[1]) || 1;
    const ux = dw[0] / wl, uy = dw[1] / wl, nx = -uy, ny = ux;
    const cw = H * 0.046 * k;
    const c0 = [g.wrist[0] - ux * H * 0.022 * k, g.wrist[1] - uy * H * 0.022 * k];
    const cuff = new Path2D();
    cuff.moveTo(c0[0] + nx * cw, c0[1] + ny * cw);
    cuff.lineTo(g.wrist[0] + nx * cw, g.wrist[1] + ny * cw);
    cuff.lineTo(g.wrist[0] - nx * cw, g.wrist[1] - ny * cw);
    cuff.lineTo(c0[0] - nx * cw, c0[1] - ny * cw);
    cuff.closePath();
    this.fillPath(cuff, lighter(col, s.cuffLight ?? 0.18));
    this.outline([[c0[0] + nx * cw, c0[1] + ny * cw], [c0[0] - nx * cw, c0[1] - ny * cw]], this.lw(0.008), 0.85, 47, 0.05);
    const grip = p.grip === side || p.grip === 'both';
    this.drawHand(g, ux, uy, f, grip, k);
  }
  drawHand(g, ux, uy, f, grip, k) {
    const r = this.L.headR * (this.s.child ? 0.36 : 0.31);
    const ctx = this.ctx;
    // 手的局部坐标：x 沿小臂，y 指向拇指一侧（朝上/朝前）
    let nx = -uy, ny = ux;
    if (ny > 0.15 || (Math.abs(ny) <= 0.15 && nx * f < 0)) { nx = -nx; ny = -ny; }
    const o = [g.wrist[0] - ux * r * 0.1, g.wrist[1] - uy * r * 0.1];
    const P = (a, b) => [o[0] + ux * a * r + nx * b * r, o[1] + uy * a * r + ny * b * r];
    const path = new Path2D();
    let pts;
    if (grip) {
      pts = [P(0, -0.36), P(0.5, -0.46), P(0.92, -0.32), P(1.02, 0.02), P(0.88, 0.34), P(0.62, 0.48), P(0.3, 0.46), P(0.05, 0.36)];
    } else {
      pts = [P(0, -0.3), P(0.55, -0.36), P(0.95, -0.26), P(1.12, -0.02), P(1.0, 0.2), P(0.62, 0.3), P(0.62, 0.58), P(0.42, 0.66), P(0.26, 0.42), P(0.04, 0.32)];
    }
    path.moveTo((pts[pts.length - 1][0] + pts[0][0]) / 2, (pts[pts.length - 1][1] + pts[0][1]) / 2);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    }
    path.closePath();
    this.fillPath(path, C.skin);
    this.shadeAcross(path, P(0.5, 0.5), P(0.5, -0.45), SHADE_SKIN, 0.4);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = this.a;
    ctx.lineWidth = this.lw(0.009);
    ctx.strokeStyle = rgba(inkRGB(0.82), 0.9);
    ctx.stroke(path);
    if (this.rv > 26) {
      ctx.lineWidth = this.lw(0.005);
      const fl = grip ? [[P(0.55, -0.2), P(0.85, -0.12)], [P(0.5, 0.02), P(0.86, 0.1)], [P(0.42, 0.28), P(0.66, 0.3)]] : [[P(0.8, -0.16), P(1.02, -0.1)], [P(0.8, 0.04), P(1.02, 0.06)]];
      for (const [a, b] of fl) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    }
    ctx.restore();
  }

  // ---------- 躯干与衣服 ----------
  drawBody(J, p, t) {
    const s = this.s, L = this.L, H = L.H;
    const f = J.f;
    const ax = [J.chest[0] - J.hip[0], J.chest[1] - J.hip[1]];
    const al = Math.hypot(ax[0], ax[1]) || 1;
    const u = [ax[0] / al, ax[1] / al];
    let n = [-u[1], u[0]];
    if (n[0] * f < 0) n = [-n[0], -n[1]];
    const k = s.child ? 1.25 : 1;
    const wc = H * 0.155 * k * (s.build ?? 1);
    const wh = H * 0.165 * k * (s.build ?? 1) * (s.flare ?? 1);
    const hem = H * (s.hem ?? 0.08);
    const long = (s.hem ?? 0) > 0.2;
    // 衣摆滞后：向运动的反方向摆，加一点风
    const vx = clamp(-this.v[0] / (H * 2.5), -0.6, 0.6);
    const sway = (vx * 0.06 + noise1(t * 1.1, H) * (long ? 0.014 : 0.005) - (p.wind ?? 0.4) * (long ? 0.01 : 0.003)) * H;
    const P = (base, k1, k2) => [base[0] + n[0] * k1 - u[0] * k2, base[1] + n[1] * k1 - u[1] * k2];
    const hunch = (s.style === 'grandpa' ? 0.08 : 0) + clamp(J.lean, 0, 0.5) * 0.12;
    const pts = [
      P(J.chest, -wc * 0.34, -H * 0.03),
      P(J.chest, wc * 0.3, -H * 0.022),
      P(J.chest, wc * 0.58, L.torso * 0.22),
      P(J.chest, wc * 0.5, L.torso * 0.62),
      (() => { const q = P(J.hip, wh * 0.64, hem); return [q[0] + sway, q[1]]; })(),
      (() => { const q = P(J.hip, -wh * 0.62, hem * (long ? 1.02 : 1)); return [q[0] + sway * 1.5, q[1]]; })(),
      P(J.hip, -wh * 0.5, -L.torso * 0.15),
      P(J.chest, -wc * (0.66 + hunch), L.torso * 0.28),
    ];
    const path = new Path2D();
    const smooth = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      smooth.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
    path.moveTo(smooth[smooth.length - 1][0], smooth[smooth.length - 1][1]);
    const outlinePts = [];
    for (let i = 0; i < pts.length; i++) {
      path.quadraticCurveTo(pts[i][0], pts[i][1], smooth[i][0], smooth[i][1]);
      const prev = smooth[(i + smooth.length - 1) % smooth.length];
      for (let q = 0; q <= 5; q++) {
        const tt = q / 5, a = prev, c = pts[i], b = smooth[i];
        outlinePts.push([(1 - tt) * (1 - tt) * a[0] + 2 * (1 - tt) * tt * c[0] + tt * tt * b[0], (1 - tt) * (1 - tt) * a[1] + 2 * (1 - tt) * tt * c[1] + tt * tt * b[1]]);
      }
    }
    path.closePath();
    const jc = colOf(s.jacket ?? 0.7);
    this.fillPath(path, jc);
    const mid = [(J.chest[0] + J.hip[0]) / 2, (J.chest[1] + J.hip[1]) / 2];
    this.shadeAcross(path, [mid[0] + n[0] * wc * 0.6, mid[1] + n[1] * wc * 0.6 - H * 0.05], [mid[0] - n[0] * wc * 0.7, mid[1] - n[1] * wc * 0.7 + H * 0.05], SHADE_CLOTH, 0.4);
    // 轮廓：背侧粗，前襟细。沿闭合轮廓切成连续的几段，不排序（排序会在转角处折返出毛刺）
    {
      const N = outlinePts.length;
      const isBack = outlinePts.map((q) => (q[0] - mid[0]) * n[0] + (q[1] - mid[1]) * n[1] < -wc * 0.05);
      let st = 0;
      for (let i = 0; i < N; i++) if (isBack[i] !== isBack[(i + N - 1) % N]) { st = i; break; }
      let cur = [outlinePts[st]], cb = isBack[st];
      const runs = [];
      for (let j = 1; j <= N; j++) {
        const i = (st + j) % N;
        if (j === N || isBack[i] !== cb) {
          runs.push([cb, cur]);
          if (j < N) { cur = [outlinePts[(i + N - 1) % N], outlinePts[i]]; cb = isBack[i]; }
        } else cur.push(outlinePts[i]);
      }
      if (runs.length === 1) runs[0][1].push(runs[0][1][0]);
      runs.forEach(([b, pts], i) => { if (pts.length > 1) this.outline(pts, this.lw(b ? 0.024 : 0.013), INK_LINE, 61 + i, 0.1); });
    }
    const ctx = this.ctx;
    // 立领
    const collar = new Path2D();
    const cA = P(J.chest, -wc * 0.12, -H * 0.03), cB = P(J.chest, wc * 0.34, -H * 0.012);
    collar.moveTo(cA[0], cA[1]);
    collar.lineTo(cB[0], cB[1]);
    collar.lineTo(cB[0] - u[0] * H * 0.03, cB[1] - u[1] * H * 0.03);
    collar.lineTo(cA[0] - u[0] * H * 0.035, cA[1] - u[1] * H * 0.035);
    collar.closePath();
    this.fillPath(collar, s.collar ? colOf(s.collar) : lighter(jc, 0.12));
    this.outline([[cA[0] - u[0] * H * 0.035, cA[1] - u[1] * H * 0.035], [cB[0] - u[0] * H * 0.03, cB[1] - u[1] * H * 0.03], cB], this.lw(0.008), 0.85, 64, 0.05);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = this.a;
    // 对襟中线 + 盘扣
    const c0 = P(J.chest, wc * 0.33, -H * 0.01), c1 = P(J.hip, wh * 0.38, hem * 0.92);
    line(ctx, [c0, c1], this.lw(0.009), inkRGB(0.85), 0.8);
    if (s.buttons) {
      for (let q = 0; q < 5; q++) {
        const c = [lerp(c0[0], c1[0], 0.1 + q * 0.18), lerp(c0[1], c1[1], 0.1 + q * 0.18)];
        const bw = H * 0.022;
        line(ctx, [[c[0] - n[0] * bw, c[1] - n[1] * bw], [c[0] + n[0] * bw, c[1] + n[1] * bw]], this.lw(0.011), inkRGB(0.25), 0.9);
        blob(ctx, c[0] + n[0] * bw, c[1] + n[1] * bw, H * 0.006, { tone: 0.3, alpha: 0.9, sides: 6, seed: 70 + q });
      }
    }
    // 衣褶：腰部与下摆各两笔
    const fold = (a, b, seed, w = 0.008) => stroke(ctx, [a, b], { w: this.lw(w), tone: 0.88, alpha: 0.42, dry: 0.3, taperIn: 0.4, taperOut: 0.5, seed });
    fold(P(J.hip, -wh * 0.15, -L.torso * 0.18), P(J.hip, -wh * 0.08, hem * 0.7), 66);
    fold(P(J.hip, wh * 0.1, -L.torso * 0.05), P(J.hip, wh * 0.18, hem * 0.75), 67, 0.006);
    if (long) {
      fold(P(J.hip, -wh * 0.38, hem * 0.2), [P(J.hip, -wh * 0.42, hem)[0] + sway * 1.3, P(J.hip, -wh * 0.42, hem)[1]], 68, 0.007);
      // 长外套的开衩
      const sl = P(J.hip, -wh * 0.55, hem * 0.55);
      line(ctx, [sl, [P(J.hip, -wh * 0.6, hem)[0] + sway * 1.5, P(J.hip, -wh * 0.6, hem)[1]]], this.lw(0.008), inkRGB(0.8), 0.7);
    }
    ctx.restore();
    // 白围巾（奔丧）
    if (s.scarf) {
      const sp = new Path2D();
      const sc0 = P(J.chest, -wc * 0.35, -H * 0.03), sc1 = P(J.chest, wc * 0.32, -H * 0.02);
      sp.moveTo(sc0[0], sc0[1]);
      sp.quadraticCurveTo((sc0[0] + sc1[0]) / 2, (sc0[1] + sc1[1]) / 2 + H * 0.05, sc1[0], sc1[1]);
      sp.lineTo(sc1[0] - u[0] * H * 0.035, sc1[1] - u[1] * H * 0.035);
      sp.quadraticCurveTo((sc0[0] + sc1[0]) / 2, (sc0[1] + sc1[1]) / 2 + H * 0.01, sc0[0] - u[0] * H * 0.035, sc0[1] - u[1] * H * 0.035);
      sp.closePath();
      this.fillPath(sp, colOf(s.scarf));
      const tail = [P(J.chest, -wc * 0.3, -H * 0.01), [P(J.chest, -wc * 0.55, L.torso * 0.25)[0] + sway, P(J.chest, -wc * 0.55, L.torso * 0.25)[1]], [P(J.chest, -wc * 0.62, L.torso * 0.55)[0] + sway * 1.8, P(J.chest, -wc * 0.62, L.torso * 0.55)[1]]];
      const cap = this.capsule(tail, [H * 0.04, H * 0.036, H * 0.03]);
      this.fillPath(cap.path, colOf(s.scarf));
      this.outline(cap.L, this.lw(0.007), 0.6, 69);
      this.outline(cap.R, this.lw(0.007), 0.6, 70);
    }
  }

  drawBackpack(J) {
    const H = this.L.H, f = J.f;
    const c = [lerp(J.chest[0], J.hip[0], 0.42) - f * H * 0.12, lerp(J.chest[1], J.hip[1], 0.42)];
    const bp = new Path2D();
    bp.roundRect(c[0] - H * 0.078, c[1] - H * 0.115, H * 0.156, H * 0.23, H * 0.04);
    this.fillPath(bp, [92, 98, 110]);
    this.shadeAcross(bp, [c[0] + f * H * 0.07, c[1]], [c[0] - f * H * 0.08, c[1] + H * 0.05], SHADE_CLOTH, 0.45);
    this.outline([[c[0] - f * H * 0.078, c[1] - H * 0.1], [c[0] - f * H * 0.078, c[1] + H * 0.105], [c[0] + f * H * 0.07, c[1] + H * 0.115]], this.lw(0.016), INK_LINE, 3, 0.05);
    const flap = new Path2D();
    flap.roundRect(c[0] - H * 0.07, c[1] - H * 0.1, H * 0.14, H * 0.07, H * 0.02);
    this.fillPath(flap, [110, 116, 128]);
  }

  // ---------- 头 ----------
  drawHead(J, p, t) {
    const s = this.s, L = this.L, H = L.H, r = L.headR;
    const f = J.f;
    const ctx = this.ctx;
    const [hx, hy] = J.head;
    const tilt = (J.lean * 0.4 + J.hd) * f;
    const E = { ...EXPR[p.expr || 'happy'] };
    if (p.mouth) E.mouth = p.mouth;
    const closed = p.eyesClosed ?? E.eyesClosed ?? false;
    const blink = !closed && this.blinking(t);
    const det = this.rv; // 头半径（屏幕虚拟像素），决定细节多少
    // 惯性：速度换到头部局部坐标
    const c = Math.cos(-tilt), sn = Math.sin(-tilt);
    const vl = [this.v[0] * c - this.v[1] * sn, this.v[0] * sn + this.v[1] * c];
    const wind = p.wind ?? 0.6;
    const trail = (rest, kk, len) => {
      const lag = [-vl[0] / (H * 1.1), -vl[1] / (H * 1.1)];
      const fl = noise1(t * (2.2 + Math.hypot(vl[0], vl[1]) / H), kk + this.seed) * (0.25 + wind * 0.25);
      const d = [Math.cos(rest) + lag[0] * 0.9 - wind * 0.35, Math.sin(rest) + lag[1] * 0.5];
      const a = Math.atan2(d[1], d[0]) + fl;
      return a;
    };
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(tilt);
    const hair = colOf(s.hair ?? 0.92);
    const hairLine = (pts, w = 0.006, al = 0.5) => {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      stroke(ctx, pts, { w: this.lw(w), tone: 0.95, alpha: al * this.a, dry: 0.2, taperIn: 0.3, taperOut: 0.6, seed: 401 + pts.length });
      ctx.restore();
    };
    // 脖子
    const nk = new Path2D();
    nk.rect(-r * 0.24, r * 0.5, r * 0.48, r * 0.62);
    this.fillPath(nk, C.skin);
    this.shadeAcross(nk, [f * r * 0.2, r * 0.6], [-f * r * 0.25, r * 0.9], SHADE_SKIN, 0.5);
    // ---- 头后的发髻、马尾 ----
    if (s.style === 'ponytail') {
      const base = [-f * r * 0.82, -r * 0.28];
      const a = trail(Math.atan2(1.2, -f * 0.55), 7, r * 1.4);
      const tail = [];
      for (let i = 0; i <= 7; i++) {
        const q = i / 7;
        const bend = Math.sin(q * Math.PI * 0.8) * 0.25 * -f;
        tail.push([base[0] + Math.cos(a + bend * q) * r * 1.45 * q, base[1] + Math.sin(a + bend * q) * r * 1.45 * q]);
      }
      const cap = this.capsule(tail, tail.map((_, i) => r * lerp(0.55, 0.16, i / 7)));
      this.fillPath(cap.path, hair);
      if (det > 18) for (let j = 0; j < 3; j++) hairLine(tail.map((q, i) => [q[0] + (j - 1) * r * 0.1 * (1 - i / 7), q[1]]), 0.004, 0.35);
    }
    if (s.style === 'bun') {
      const bn = new Path2D();
      bn.ellipse(-f * r * 0.94, r * 0.14, r * 0.42, r * 0.38, 0, 0, TAU);
      this.fillPath(bn, hair);
      if (det > 18) hairLine([[-f * r * 0.7, r * 0.0], [-f * r * 1.05, r * 0.08], [-f * r * 0.95, r * 0.35]], 0.005, 0.4);
    }
    if (s.style === 'buns') {
      for (const [bx, by] of [[-f * r * 0.64, -r * 0.88], [f * r * 0.32, -r * 1.0]]) {
        const bn = new Path2D();
        bn.arc(bx, by, r * 0.42, 0, TAU);
        this.fillPath(bn, hair);
        if (det > 18) hairLine(Array.from({ length: 7 }, (_, i) => { const a = Math.PI * (1.1 + i * 0.13); return [bx + Math.cos(a) * r * 0.27, by + Math.sin(a) * r * 0.27]; }), 0.004, 0.3);
      }
    }
    // ---- 红头绳：飘带在头后（先画，被脸和头发挡住），蝴蝶结在上（后画） ----
    const ribbonTails = (x, y, len, kk, rest) => {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (let j = 0; j < 2; j++) {
        const a = trail(rest + j * 0.4 * -f, kk + j, len);
        const tail = [];
        for (let i = 0; i <= 7; i++) {
          const q = i / 7;
          const wv = Math.sin(t * (7 + j) + q * 4 + kk) * len * 0.07 * q * (0.6 + wind * 0.6);
          tail.push([x + Math.cos(a) * len * q - Math.sin(a) * wv, y + Math.sin(a) * len * q + Math.cos(a) * wv]);
        }
        stroke(ctx, tail, { w: r * 0.15, color: C.vermilion, alpha: 0.97 * this.a, dry: 0, taperIn: 0.05, taperOut: 0.45, seed: 90 + kk + j });
      }
      ctx.restore();
    };
    const ribbonBow = (x, y, kk) => {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (const sgn of [-1, 1]) blob(ctx, x + sgn * r * 0.16, y, r * 0.15, { fill: rgba(C.vermilion, 0.97 * this.a), sx: 1.25, sy: 0.75, angle: sgn * 0.3, seed: 80 + kk + sgn });
      blob(ctx, x, y, r * 0.08, { fill: rgba([150, 36, 28], this.a), seed: 88 + kk });
      ctx.restore();
    };
    const RIB = s.style === 'buns'
      ? [[-f * r * 0.72, -r * 0.62, r * 0.85, 1, Math.atan2(0.75, -f)], [f * r * 0.26, -r * 0.74, r * 0.62, 2, Math.atan2(0.35, -f)]]
      : s.style === 'ponytail' ? [[-f * r * 0.84, -r * 0.3, r * 0.85, 3, Math.atan2(1.0, -f)]] : [];
    for (const [x, y, len, kk, rest] of RIB) ribbonTails(x, y, len, kk, rest);
    // ---- 耳朵（在发际线处，画在头发之后） ----
    const ear = new Path2D();
    ear.ellipse(-f * r * 0.5, r * 0.16, r * 0.14, r * 0.2, f * 0.25, 0, TAU);
    // ---- 脸 ----
    const face = new Path2D();
    face.ellipse(f * r * 0.04, r * 0.04, r * 0.98, r * (s.child ? 0.95 : 1.0), 0, 0, TAU);
    this.fillPath(face, C.skin);
    this.shadeAcross(face, [f * r * 0.9, -r * 0.3], [-f * r * 0.95, r * 0.6], SHADE_SKIN, 0.38);
    // ---- 头发 / 帽子 ----
    if (s.style === 'grandpa') {
      // 鬓角与后脑白发（白粉，月牙形贴着帽檐下）
      const sb = new Path2D();
      sb.moveTo(-f * r * 1.0, -r * 0.3);
      sb.quadraticCurveTo(-f * r * 1.1, r * 0.15, -f * r * 0.8, r * 0.5);
      sb.lineTo(-f * r * 0.74, r * 0.36);
      sb.lineTo(-f * r * 0.7, r * 0.42);
      sb.quadraticCurveTo(-f * r * 0.8, r * 0.05, -f * r * 0.64, -r * 0.3);
      sb.closePath();
      if (this.W8) {
        const W8 = this.W8;
        W8.save();
        W8.setTransform(ctx.getTransform());
        W8.globalAlpha = this.a;
        W8.fillStyle = 'rgba(255,255,255,0.95)';
        W8.fill(sb);
        W8.restore();
      }
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = this.a;
      ctx.lineWidth = this.lw(0.004);
      ctx.strokeStyle = rgba(inkRGB(0.4), 0.5);
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(-f * r * (0.9 - k * 0.08), -r * 0.2 + k * r * 0.12);
        ctx.quadraticCurveTo(-f * r * (0.92 - k * 0.06), r * (0.15 + k * 0.08), -f * r * (0.66 + k * 0.03), r * (0.42 + k * 0.03));
        ctx.stroke();
      }
      ctx.restore();
      // 瓜皮帽：六瓣
      const cp = new Path2D();
      cp.ellipse(-f * r * 0.02, -r * 0.3, r * 1.02, r * 0.78, 0, Math.PI, TAU);
      cp.closePath();
      this.fillPath(cp, [40, 40, 44]);
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = this.a;
      ctx.strokeStyle = rgba([86, 86, 92], 0.9);
      ctx.lineWidth = this.lw(0.006);
      for (const k of [-0.55, -0.15, 0.25, 0.62]) {
        ctx.beginPath();
        ctx.moveTo(-f * r * 0.02, -r * 1.06);
        ctx.quadraticCurveTo(k * r * f * 0.9, -r * 0.8, k * r * f * 1.2, -r * 0.31);
        ctx.stroke();
      }
      ctx.fillStyle = rgba([60, 60, 64], 1);
      ctx.fillRect(-r * 1.02, -r * 0.36, r * 2.0, r * 0.1);
      ctx.restore();
      const kn = new Path2D();
      kn.arc(-f * r * 0.02, -r * 1.1, r * 0.14, 0, TAU);
      this.fillPath(kn, [30, 30, 34]);
    } else {
      // 以下按朝右书写，朝左时整体镜像
      ctx.save();
      ctx.scale(f, 1);
      const ry = r * (s.child ? 0.95 : 1.0);
      const hp = new Path2D();
      // 发顶与后脑：比脸大一圈的椭圆弧，保证盖住头顶
      // 椭圆圆心偏后：头顶和后脑留出发量，前额处与脸缘对齐，不出尖角
      hp.moveTo(-r * 1.0, r * 0.36);
      hp.ellipse(-r * 0.04, r * 0.06, r * 1.04, ry * 1.1, 0, Math.PI * 0.92, Math.PI * 1.9167, false);
      // 刘海：齐眉，略带参差
      let bangs = [[r * 0.97, -r * 0.2], [r * 0.78, -r * 0.3], [r * 0.6, -r * 0.24], [r * 0.42, -r * 0.3], [r * 0.24, -r * 0.25], [r * 0.06, -r * 0.32], [-r * 0.1, -r * 0.42]];
      // 成年女性：侧分，额头露出
      if (s.style === 'bun') bangs = [[r * 0.97, -r * 0.2], [r * 0.7, -r * 0.48], [r * 0.3, -r * 0.6], [-r * 0.05, -r * 0.55]];
      for (const q of bangs) hp.lineTo(q[0], q[1]);
      hp.bezierCurveTo(-r * 0.3, -r * 0.1, -r * 0.5, r * 0.3, -r * 0.58, r * 0.62);
      hp.closePath();
      this.fillPath(hp, hair);
      if (det > 20) {
        hairLine([[r * 0.7, -r * 0.62], [r * 0.1, -r * 0.92], [-r * 0.5, -r * 0.72]], 0.004, 0.25);
        hairLine([[-r * 0.85, -r * 0.4], [-r * 0.95, r * 0.0], [-r * 0.84, r * 0.3]], 0.004, 0.25);
      }
      // 高光一笔（墨发上的留白，用白粉），落在后脑的头发里
      if (det > 16 && this.W8) {
        const W8 = this.W8;
        W8.save();
        W8.setTransform(ctx.getTransform());
        W8.globalAlpha = this.a * 0.32;
        W8.strokeStyle = '#fff';
        W8.lineWidth = r * 0.06;
        W8.lineCap = 'round';
        W8.beginPath();
        W8.ellipse(r * 0.04, r * 0.04, r * 0.84, ry * 0.86, 0, Math.PI * 1.13, Math.PI * 1.36);
        W8.stroke();
        W8.restore();
      }
      ctx.restore();
    }
    if (s.style !== 'grandpa') {
      this.fillPath(ear, C.skin);
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = this.a;
      ctx.lineWidth = this.lw(0.008);
      ctx.strokeStyle = rgba(inkRGB(0.8), 0.8);
      ctx.beginPath();
      ctx.ellipse(-f * r * 0.5, r * 0.16, r * 0.14, r * 0.2, f * 0.25, f > 0 ? Math.PI * 0.6 : -Math.PI * 0.6, f > 0 ? Math.PI * 1.9 : Math.PI * 0.9);
      ctx.stroke();
      ctx.restore();
    }
    // 脸的轮廓（背侧略粗）
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = this.a;
    ctx.strokeStyle = rgba(inkRGB(0.85), 0.85);
    ctx.lineWidth = this.lw(0.012);
    ctx.beginPath();
    ctx.ellipse(f * r * 0.04, r * 0.04, r * 0.98, r * (s.child ? 0.95 : 1.0), 0, f > 0 ? Math.PI * 0.25 : Math.PI * 0.35, f > 0 ? Math.PI * 0.65 : Math.PI * 0.75);
    ctx.stroke();
    ctx.lineWidth = this.lw(0.008);
    ctx.beginPath();
    ctx.ellipse(f * r * 0.04, r * 0.04, r * 0.98, r * (s.child ? 0.95 : 1.0), 0, f > 0 ? -Math.PI * 0.3 : Math.PI * 0.75, f > 0 ? Math.PI * 0.25 : Math.PI * 1.3);
    ctx.stroke();
    ctx.restore();
    for (const [x, y, , kk] of RIB) ribbonBow(x, y, kk);
    // ---- 五官 ----
    const eyeY = (p.eyesDown ? r * 0.1 : 0) + (p.eyesUp ? -r * 0.08 : 0);
    const ex = f * r * 0.5, ex2 = f * r * 0.06;
    const er = s.child ? 1.12 : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = this.a;
    // 眉毛
    if (det > 9) {
      const by = eyeY - r * (0.3 + E.brow * 0.35);
      const browW = r * 0.16;
      const brow = (cx, near) => {
        const tiltB = E.tilt * (near ? 1 : -1) * f;
        const pts = [[cx - browW, by + tiltB * r * 0.18], [cx, by - r * 0.03], [cx + browW, by - tiltB * r * 0.18]];
        if (s.style === 'grandpa') return;
        stroke(ctx, pts, { w: this.lw(s.child ? 0.009 : 0.011), tone: 0.92, alpha: 0.9, dry: 0.1, taperIn: 0.2, taperOut: 0.5, seed: 501 + (near ? 1 : 2) });
      };
      brow(ex, true);
      brow(ex2, false);
    }
    // 眼睛
    const eyeRx = r * 0.085 * er, eyeRy = r * 0.125 * er;
    if (closed || blink || E.squint) {
      const k = blink ? 0.6 : 1;
      for (const x of [ex, ex2]) line(ctx, [[x - r * 0.13, eyeY - (E.squint ? r * 0.02 : 0)], [x, eyeY + r * 0.07 * k * (E.squint ? -1 : 1)], [x + r * 0.12, eyeY]], this.lw(0.011), inkRGB(0.95), 1);
    } else {
      for (const [x, sc] of [[ex, 1], [ex2, 0.92]]) {
        ctx.fillStyle = rgba(inkRGB(0.97), 1);
        ctx.beginPath();
        ctx.ellipse(x, eyeY, eyeRx * sc, eyeRy * sc, 0, 0, TAU);
        ctx.fill();
      }
      if (det > 14 && this.W8) {
        const W8 = this.W8;
        W8.save();
        W8.setTransform(ctx.getTransform());
        W8.globalAlpha = this.a;
        W8.fillStyle = '#fff';
        for (const [x, sc] of [[ex, 1], [ex2, 0.92]]) {
          W8.beginPath();
          W8.arc(x + f * eyeRx * 0.35, eyeY - eyeRy * 0.4, eyeRx * 0.42 * sc, 0, TAU);
          W8.fill();
        }
        W8.restore();
      }
    }
    // 鼻子（小小一笔）
    // 腮红
    ctx.restore();
    softDot(ctx, ex - f * r * 0.08, r * 0.34, r * 0.25, C.cheek, (s.style === 'grandpa' ? 0.3 : 0.62) * this.a);
    softDot(ctx, ex2 - f * r * 0.12, r * 0.34, r * 0.2, C.cheek, (s.style === 'grandpa' ? 0.18 : 0.42) * this.a);
    // 嘴
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = this.a;
    const mo = E.mouth;
    const mx = f * r * 0.36, my = r * 0.47;
    const lw = this.lw(0.01);
    if (mo === 'open') {
      blob(ctx, mx, my + r * 0.02, r * 0.14, { fill: rgba([140, 60, 52], 0.92), sx: 1.05, sy: 1.1, seed: 83 });
      blob(ctx, mx, my + r * 0.08, r * 0.07, { fill: rgba([214, 120, 110], 0.9), sx: 1.2, sy: 0.6, seed: 84 });
    } else if (mo === 'O') {
      ctx.strokeStyle = rgba(inkRGB(0.85), 0.9);
      ctx.lineWidth = lw;
      ctx.fillStyle = rgba([150, 70, 60], 0.85);
      ctx.beginPath();
      ctx.ellipse(mx, my + r * 0.02, r * 0.07, r * 0.09, 0, 0, TAU);
      ctx.fill();
    } else if (mo === 'grin') {
      ctx.fillStyle = rgba([140, 60, 52], 0.92);
      ctx.beginPath();
      ctx.moveTo(mx - r * 0.2, my - r * 0.04);
      ctx.quadraticCurveTo(mx, my + r * 0.28, mx + r * 0.16, my - r * 0.05);
      ctx.closePath();
      ctx.fill();
    } else if (mo === 'smile') {
      line(ctx, [[mx - r * 0.15, my - r * 0.03], [mx, my + r * 0.07], [mx + r * 0.12, my - r * 0.04]], lw, inkRGB(0.88), 0.95);
    } else if (mo === 'sad') {
      line(ctx, [[mx - r * 0.13, my + r * 0.06], [mx, my - r * 0.01], [mx + r * 0.11, my + r * 0.06]], lw, inkRGB(0.88), 0.95);
    } else {
      line(ctx, [[mx - r * 0.11, my + r * 0.02], [mx + r * 0.1, my + r * 0.02]], lw, inkRGB(0.82), 0.85);
    }
    ctx.restore();
    // ---- 爷爷：白眉、抬头纹、长须 ----
    if (s.style === 'grandpa') {
      const W8 = this.W8;
      const sway = (trail(Math.PI / 2, 21, r) - Math.PI / 2) * 0.6;
      // 长须：从下巴垂下、收成尖，随动作滞后摆动
      const Bp = (x, y, sw = 0) => [f * r * x + sway * r * sw, r * y];
      const beard = [Bp(-0.14, 0.6), Bp(0.14, 0.64), Bp(0.44, 0.62), Bp(0.76, 0.46), Bp(0.72, 0.86, 0.6), Bp(0.54, 1.3, 1.1), Bp(0.36, 1.84, 1.8), Bp(0.22, 1.32, 1.1), Bp(0.02, 0.94, 0.5)];
      const smoothPath = (pts) => {
        const pa = new Path2D();
        const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const s0 = m(pts[pts.length - 1], pts[0]);
        pa.moveTo(s0[0], s0[1]);
        for (let i = 0; i < pts.length; i++) {
          const e = m(pts[i], pts[(i + 1) % pts.length]);
          pa.quadraticCurveTo(pts[i][0], pts[i][1], e[0], e[1]);
        }
        pa.closePath();
        return pa;
      };
      const by = eyeY - r * 0.2 - E.brow * r * 0.2;
      // 白眉：两道下垂的弯笔（内端随表情抬落）
      const browPts = (x, near) => {
        const s1 = near ? 1 : -1; // 外端方向
        const sc = near ? 1 : 0.8;
        const lift = -E.tilt * r * 0.12;
        return [[x - f * s1 * r * 0.15 * sc, by + lift], [x, by - r * 0.045], [x + f * s1 * r * 0.15 * sc, by + r * 0.035], [x + f * s1 * r * 0.21 * sc, by + r * 0.1]];
      };
      if (W8) {
        W8.save();
        W8.setTransform(ctx.getTransform());
        W8.globalAlpha = this.a;
        W8.fillStyle = 'rgba(255,255,255,0.95)';
        W8.fill(smoothPath(beard));
        // 八字胡（白）
        for (const sg of [1, -1]) stroke(W8, [Bp(0.38, 0.37), Bp(0.38 + 0.18 * sg, 0.42), Bp(0.38 + 0.3 * sg, 0.58, 0.3)], { w: r * 0.085, color: [255, 255, 255], alpha: 0.95 * this.a, dry: 0, taperIn: 0.15, taperOut: 0.75, seed: 87 + sg });
        for (const [x, near] of [[ex, true], [ex2, false]]) stroke(W8, browPts(x, near), { w: r * 0.085, color: [255, 255, 255], alpha: 0.95 * this.a, dry: 0, taperIn: 0.2, taperOut: 0.7, seed: 91 + (near ? 1 : 0) });
        W8.restore();
      }
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = this.a;
      // 须的灰色边线与须丝
      stroke(ctx, [beard[3], beard[4], beard[5], beard[6]], { w: this.lw(0.006), tone: 0.5, alpha: 0.55, dry: 0.3, taperIn: 0.3, taperOut: 0.5, seed: 85 });
      stroke(ctx, [beard[6], beard[7], beard[8]], { w: this.lw(0.005), tone: 0.45, alpha: 0.45, dry: 0.3, taperIn: 0.3, taperOut: 0.5, seed: 86 });
      for (const sg of [1, -1]) stroke(ctx, [Bp(0.38 + 0.08 * sg, 0.43), Bp(0.38 + 0.22 * sg, 0.47), Bp(0.38 + 0.3 * sg, 0.6, 0.3)], { w: this.lw(0.004), tone: 0.45, alpha: 0.45, dry: 0.2, taperIn: 0.1, taperOut: 0.7, seed: 88 + sg });
      if (det > 14) {
        for (let k = 0; k < 6; k++) {
          const q = k / 5;
          const a0 = Bp(lerp(-0.02, 0.66, q), lerp(0.68, 0.62, q) + 0.04);
          const a2 = Bp(lerp(0.26, 0.44, q), 1.35 + (0.5 - Math.abs(q - 0.5)) * 0.4, 1.3);
          const a1 = [(a0[0] + a2[0]) / 2 + f * r * 0.04, (a0[1] + a2[1]) / 2];
          line(ctx, [a0, a1, a2], this.lw(0.0035), inkRGB(0.4), 0.42);
        }
        for (const [x, near] of [[ex, true], [ex2, false]]) {
          const bp = browPts(x, near).map(([px, py]) => [px, py + r * 0.04]);
          line(ctx, bp, this.lw(0.0035), inkRGB(0.45), 0.5);
        }
        // 抬头纹
        for (let k = 0; k < 2; k++) line(ctx, [[f * r * 0.15, -r * (0.42 + k * 0.1)], [f * r * 0.5, -r * (0.46 + k * 0.1)], [f * r * 0.75, -r * (0.42 + k * 0.1)]], this.lw(0.004), inkRGB(0.6), 0.5);
        // 眼角皱纹
        line(ctx, [[ex + f * r * 0.12, eyeY + r * 0.02], [ex + f * r * 0.22, eyeY + r * 0.06]], this.lw(0.004), inkRGB(0.6), 0.5);
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

// ---------- 姿势库 ----------
export const POSE = {
  stand: { lean: 0.02, head: 0, armF: [0.12, 0.32], armB: [-0.04, 0.26], legF: [0.06, 0.02], legB: [-0.05, 0.02] },
  standOld: { lean: 0.32, head: -0.28, armF: [0.55, 0.35], armB: [0.1, 0.4], legF: [0.18, 0.2], legB: [-0.02, 0.15], expr: 'tender' },
  sit: { lean: 0.05, head: 0, armF: [0.55, 0.75], armB: [0.45, 0.8], legF: [1.45, 1.5], legB: [1.4, 1.42] },
  sitOld: { lean: 0.28, head: -0.12, armF: [0.75, 0.6], armB: [0.6, 0.7], legF: [1.4, 1.45], legB: [1.35, 1.4], expr: 'tender' },
  doze: { lean: 0.42, head: 0.55, armF: [0.7, 0.55], armB: [0.55, 0.7], legF: [1.4, 1.45], legB: [1.35, 1.4], expr: 'sleepy', eyesClosed: true },
  holdUp: { lean: -0.05, head: -0.35, armF: [-2.75, 0.25], armB: [-2.6, 0.3], legF: [0.12, 0.05], legB: [-0.1, 0.05], expr: 'happy' },
  wave: { lean: 0, head: 0, armF: [-2.6, -0.3], armB: [-0.06, 0.1], legF: [0.06, 0.02], legB: [-0.05, 0.02], expr: 'happy' },
  point: { lean: -0.05, head: -0.4, armF: [-2.35, -0.05], armB: [-0.1, 0.2], legF: [0.06, 0.02], legB: [-0.05, 0.02], expr: 'surprised' },
  reach: { lean: 0.12, head: 0.05, armF: [1.25, 0.15], armB: [0.9, 0.3], legF: [0.15, 0.05], legB: [-0.12, 0.05] },
  holdReel: { lean: 0.02, head: -0.3, armF: [0.95, 0.7], armB: [0.75, 0.9], legF: [0.18, 0.05], legB: [-0.15, 0.05], grip: 'F' },
  lookUp: { lean: -0.06, head: -0.45, armF: [0.15, 0.2], armB: [-0.05, 0.15], legF: [0.06, 0.02], legB: [-0.05, 0.02], eyesUp: true },
  hug: { lean: 0.08, head: 0.25, armF: [0.85, 1.75], armB: [0.75, 1.85], legF: [0.05, 0.02], legB: [-0.04, 0.02], eyesDown: true, expr: 'sad' },
  crouch: { lean: 0.35, head: -0.1, armF: [0.9, 0.4], armB: [0.7, 0.5], legF: [1.1, 1.9], legB: [0.6, 1.7] },
  jump: { lean: -0.05, head: -0.25, armF: [-2.5, 0.2], armB: [-2.3, 0.3], legF: [0.35, 0.8], legB: [-0.1, 0.6], expr: 'joy' },
  paint: { lean: 0.22, head: 0.3, armF: [1.0, 0.95], armB: [0.75, 1.1], legF: [1.45, 1.5], legB: [1.4, 1.42], eyesDown: true, expr: 'focused' },
  clap: { lean: 0.02, head: -0.1, armF: [0.95, 1.25], armB: [0.85, 1.35], legF: [0.06, 0.02], legB: [-0.05, 0.02], expr: 'laugh' },
};

// ---------- 步态：关键姿势插值 ----------
// [相位, 髋, 膝, 脚] —— 前腿；后腿相位 +0.5
const WALK_LEG = [
  [0.0, 0.42, 0.04, -0.28], [0.1, 0.32, 0.22, 0.0], [0.25, 0.02, 0.1, 0.0], [0.4, -0.24, 0.06, 0.18],
  [0.5, -0.4, 0.18, 0.55], [0.62, -0.22, 0.75, 0.35], [0.75, 0.08, 0.95, 0.1], [0.88, 0.38, 0.4, -0.12],
];
const RUN_LEG = [
  [0.0, 0.55, 0.2, -0.15], [0.1, 0.35, 0.55, 0.0], [0.22, 0.0, 0.35, 0.2], [0.35, -0.45, 0.25, 0.6],
  [0.5, -0.55, 0.95, 0.7], [0.65, -0.1, 1.6, 0.4], [0.8, 0.45, 1.2, 0.1], [0.92, 0.65, 0.45, -0.1],
];
function cyc(keys, ph) {
  const n = keys.length;
  ph = ((ph % 1) + 1) % 1;
  let i = 0;
  while (i < n - 1 && keys[i + 1][0] <= ph) i++;
  const k0 = keys[(i - 1 + n) % n], k1 = keys[i], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
  const t0 = k1[0], t1 = i + 1 < n ? k2[0] : 1;
  const u = (ph - t0) / (t1 - t0 || 1);
  const out = [];
  for (let j = 1; j < k1.length; j++) {
    const p0 = k0[j], p1 = k1[j], p2 = k2[j], p3 = k3[j];
    const u2 = u * u, u3 = u2 * u;
    out.push(0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3));
  }
  return out;
}

// 走：phase 为完整步态周期（两步）
export function walk(phase, o = {}) {
  const sc = (o.stride ?? 0.4) / 0.4;
  const lf = cyc(WALK_LEG, phase), lb = cyc(WALK_LEG, phase + 0.5);
  const arm = (o.arm ?? 0.32) / 0.32;
  const c = Math.cos(TAU * (phase - 0.04));
  const bounce = Math.cos(TAU * 2 * phase);
  return {
    lean: (o.lean ?? 0.05) + bounce * 0.012,
    head: (o.head ?? 0) - bounce * 0.01,
    legF: [lf[0] * sc, lf[1] * (o.knee ?? 1)], footF: lf[2],
    legB: [lb[0] * sc, lb[1] * (o.knee ?? 1)], footB: lb[2],
    armF: [-0.34 * arm * c, 0.2 + 0.28 * (0.5 - 0.5 * c)],
    armB: [0.34 * arm * c, 0.2 + 0.28 * (0.5 + 0.5 * c)],
    moving: true,
  };
}
export function run(phase, o = {}) {
  const sc = (o.stride ?? 0.72) / 0.72;
  const lf = cyc(RUN_LEG, phase), lb = cyc(RUN_LEG, phase + 0.5);
  const c = Math.cos(TAU * (phase - 0.05));
  const fl = Math.pow(0.5 + 0.5 * Math.cos(TAU * 2 * (phase - 0.43)), 2);
  return {
    lean: o.lean ?? 0.22,
    head: (o.head ?? -0.15) + fl * 0.03,
    legF: [lf[0] * sc + 0.05, lf[1]], footF: lf[2],
    legB: [lb[0] * sc + 0.05, lb[1]], footB: lb[2],
    armF: [-0.8 * c, 1.45],
    armB: [0.8 * c, 1.45],
    lift: fl * (o.lift ?? 4),
    moving: true,
  };
}

export function blend(a, b, t) {
  return mixv(a, b, clamp(t));
}

// 由姿势函数求速度（世界单位/秒），供头绳、衣摆滞后摆动
export function withVel(pf, t, dt = 0.08) {
  const a = pf(t), b = pf(t - dt);
  return { ...a, v: [(a.x - b.x) / dt, (a.y - b.y) / dt] };
}
