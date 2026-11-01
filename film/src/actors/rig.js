// 参数化人物骨骼 + 水墨画法。所有角色共用：爷爷、小燕（各年龄）、女儿。
// 角度单位：弧度。0 = 肢体自然下垂；正值 = 朝面向方向前摆。膝盖正值 = 小腿向后弯。
import { stroke, blob, rgba, inkRGB, softDot, whiteOf, line } from '../ink/brush.js';
import { lerp, clamp, TAU, mixv } from '../core/math.js';
import { noise1 } from '../core/noise.js';
import { C } from '../world/palette.js';

const colOf = (c) => (Array.isArray(c) ? c : inkRGB(c));

export class Figure {
  constructor(spec) {
    this.s = spec;
    const H = spec.height;
    const k = spec.child
      ? { neck: 0.03, torso: 0.27, ua: 0.15, fa: 0.13, th: 0.2, sh: 0.19, foot: 0.08 }
      : { neck: 0.035, torso: 0.3, ua: 0.17, fa: 0.15, th: 0.235, sh: 0.225, foot: 0.07 };
    this.L = { H, headR: spec.headR, neck: k.neck * H, torso: k.torso * H, ua: k.ua * H, fa: k.fa * H, th: k.th * H, sh: k.sh * H, foot: k.foot * H, ankle: 0.025 * H };
  }

  // p: { x, y(地面), facing, lean, head, armF:[肩,肘], armB, legF:[髋,膝], legB, sit(坐高), lift }
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
    const lowest = Math.max(legs.F.ankle[1], legs.B.ankle[1]) + L.ankle;
    const hipY = p.sit != null ? p.y - p.sit : p.y - lowest - (p.lift || 0);
    const lean = p.lean || 0;
    const hd = p.head || 0;
    const chest = add([0, 0], up(lean), L.torso);
    const neck = add(chest, up(lean * 0.6 + hd * 0.3), L.neck);
    const head = add(neck, up(lean * 0.4 + hd), L.headR * 0.92);
    const shoulder = add(chest, down(lean), L.torso * 0.08);
    const arms = {};
    for (const side of ['F', 'B']) {
      const [s, e] = p['arm' + side] || [0, 0];
      const sh = [shoulder[0] + f * (side === 'F' ? 0.6 : -1.2) * L.H * 0.012, shoulder[1]];
      const elbow = add(sh, down(s + lean * 0.5), L.ua);
      const wrist = add(elbow, down(s + e + lean * 0.5), L.fa);
      const hand = add(wrist, down(s + e + lean * 0.5), L.headR * 0.32);
      arms[side] = { sh, elbow, wrist, hand, ang: s + e + lean * 0.5 };
    }
    const O = [p.x, hipY];
    const T = (q) => [q[0] + O[0], q[1] + O[1]];
    const J = {
      f, hip: T([0, 0]), chest: T(chest), neck: T(neck), head: T(head), shoulder: T(shoulder), lean, hd,
      legF: { hip: T(legs.F.hip), knee: T(legs.F.knee), ankle: T(legs.F.ankle), toe: T(legs.F.toe) },
      legB: { hip: T(legs.B.hip), knee: T(legs.B.knee), ankle: T(legs.B.ankle), toe: T(legs.B.toe) },
      armF: { sh: T(arms.F.sh), elbow: T(arms.F.elbow), wrist: T(arms.F.wrist), hand: T(arms.F.hand), ang: arms.F.ang },
      armB: { sh: T(arms.B.sh), elbow: T(arms.B.elbow), wrist: T(arms.B.wrist), hand: T(arms.B.hand), ang: arms.B.ang },
    };
    return J;
  }

  draw(ctx, p, t = 0) {
    const J = this.joints(p);
    const a = p.alpha ?? 1;
    ctx.save();
    this.a = a;
    this.ctx = ctx;
    this.W8 = whiteOf(ctx);
    if (this.s.backpack) this.drawBackpack(ctx, J, a);
    this.drawArm(J, 'B', true);
    this.drawLeg(J, 'B', true);
    this.drawBody(J, p, t);
    this.drawLeg(J, 'F', false);
    if (p.armFBehind) this.drawArm(J, 'F', false);
    this.drawHead(J, p, t);
    if (!p.armFBehind) this.drawArm(J, 'F', false);
    ctx.restore();
    return J;
  }

  // 不透明填充 + 擦掉身后的白粉；再用墨线勾边
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
  outline(pts, w, tone = 0.9, closed = false, seed = 1) {
    const P = closed ? [...pts, pts[0], pts[1]] : pts;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    stroke(ctx, P, { w, tone, alpha: 0.9 * this.a, dry: 0.05, body: 1, taperIn: closed ? 0 : 0.15, taperOut: closed ? 0 : 0.25, seed, wobble: 0.2, fade: 0 });
    ctx.restore();
  }
  // 沿骨骼的胶囊形肢体轮廓
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
    // 末端圆头
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

  drawLeg(J, side, back) {
    const s = this.s, L = this.L, H = L.H;
    const g = J['leg' + side];
    const k = s.child ? 1.2 : 1;
    const col = colOf(s.trousers ?? 0.45).map((v) => (back ? v * 0.9 : v));
    const cap = this.capsule([g.hip, g.knee, g.ankle], [H * 0.095 * k, H * 0.075 * k, H * 0.062 * k]);
    this.fillPath(cap.path, col);
    this.outline(cap.L, H * 0.014, 0.88, false, 11);
    this.outline(cap.R, H * 0.014, 0.88, false, 12);
    // 鞋
    const sc = colOf(s.shoes ?? 0.92);
    const mid = [(g.ankle[0] * 0.55 + g.toe[0] * 0.45), (g.ankle[1] * 0.55 + g.toe[1] * 0.45) + H * 0.008];
    const ang = Math.atan2(g.toe[1] - g.ankle[1], g.toe[0] - g.ankle[0]);
    const sh = new Path2D();
    sh.ellipse(mid[0], mid[1], L.foot * 0.68 * k, H * 0.03 * k, ang, 0, TAU);
    this.fillPath(sh, sc);
  }

  drawArm(J, side, back) {
    const s = this.s, L = this.L, H = L.H;
    const g = J['arm' + side];
    const k = s.child ? 1.2 : 1;
    const col = colOf(s.sleeve ?? s.jacket ?? 0.7).map((v) => (back ? v * 0.9 : v));
    const cap = this.capsule([g.sh, g.elbow, g.wrist], [H * 0.082 * k, H * 0.068 * k, H * 0.06 * k]);
    this.fillPath(cap.path, col);
    this.outline(cap.L, H * 0.013, 0.88, false, 41);
    this.outline(cap.R, H * 0.013, 0.88, false, 42);
    const hr = L.headR * (s.child ? 0.34 : 0.3);
    const hp = new Path2D();
    hp.arc(g.hand[0], g.hand[1], hr, 0, TAU);
    this.fillPath(hp, C.skin);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineWidth = Math.max(0.5, H * 0.011);
    ctx.strokeStyle = rgba(inkRGB(0.75), 0.8 * this.a);
    ctx.stroke(hp);
    ctx.restore();
  }

  drawBody(J, p, t) {
    const s = this.s, L = this.L, H = L.H;
    const f = J.f;
    const ax = [J.chest[0] - J.hip[0], J.chest[1] - J.hip[1]];
    const al = Math.hypot(ax[0], ax[1]) || 1;
    const u = [ax[0] / al, ax[1] / al];
    let n = [-u[1], u[0]];
    if (n[0] * f < 0) n = [-n[0], -n[1]];
    const k = s.child ? 1.25 : 1;
    const wc = H * 0.15 * k * (s.build ?? 1);
    const wh = H * 0.16 * k * (s.build ?? 1) * (s.flare ?? 1);
    const hem = H * (s.hem ?? 0.08);
    const sway = noise1(t * 1.3, H) * H * 0.01 * ((s.hem ?? 0) > 0.2 ? 1 : 0.3);
    const P = (base, k1, k2) => [base[0] + n[0] * k1 - u[0] * k2, base[1] + n[1] * k1 - u[1] * k2];
    const pts = [
      P(J.chest, -wc * 0.42, -H * 0.02),
      P(J.chest, wc * 0.38, -H * 0.012),
      P(J.chest, wc * 0.55, L.torso * 0.32),
      (() => { const q = P(J.hip, wh * 0.6, hem); return [q[0] + sway, q[1]]; })(),
      (() => { const q = P(J.hip, -wh * 0.58, hem); return [q[0] + sway * 1.4, q[1]]; })(),
      P(J.chest, -wc * 0.6, L.torso * 0.5),
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
      for (let q = 0; q <= 4; q++) {
        const tt = q / 4, a = prev, c = pts[i], b = smooth[i];
        outlinePts.push([(1 - tt) * (1 - tt) * a[0] + 2 * (1 - tt) * tt * c[0] + tt * tt * b[0], (1 - tt) * (1 - tt) * a[1] + 2 * (1 - tt) * tt * c[1] + tt * tt * b[1]]);
      }
    }
    path.closePath();
    this.fillPath(path, colOf(s.jacket ?? 0.7));
    this.outline(outlinePts, H * 0.016, 0.92, true, 61);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    if (s.buttons) {
      const c0 = P(J.chest, wc * 0.3, L.torso * 0.12), c1 = P(J.hip, wh * 0.36, hem * 0.7);
      line(ctx, [c0, c1], H * 0.01, inkRGB(0.15), 0.8 * this.a);
      for (let q = 0; q < 4; q++) {
        const c = [lerp(c0[0], c1[0], 0.15 + q * 0.22), lerp(c0[1], c1[1], 0.15 + q * 0.22)];
        line(ctx, [[c[0] - n[0] * H * 0.018, c[1] - n[1] * H * 0.018], [c[0] + n[0] * H * 0.018, c[1] + n[1] * H * 0.018]], H * 0.01, inkRGB(0.1), 0.8 * this.a);
      }
    }
    // 衣褶
    const fold0 = P(J.hip, -wh * 0.1, -L.torso * 0.15), fold1 = P(J.hip, -wh * 0.05, hem * 0.8);
    stroke(ctx, [fold0, fold1], { w: H * 0.009, tone: 0.9, alpha: 0.35 * this.a, dry: 0.3, taperIn: 0.4, taperOut: 0.4, seed: 66 });
    ctx.restore();
    if (s.scarf) {
      const sp = new Path2D();
      sp.ellipse(J.neck[0], J.neck[1] + H * 0.012, H * 0.055, H * 0.03, 0, 0, TAU);
      this.fillPath(sp, colOf(s.scarf));
    }
  }

  drawBackpack(ctx, J, a) {
    const H = this.L.H, f = J.f;
    const c = [lerp(J.chest[0], J.hip[0], 0.4) - f * H * 0.11, lerp(J.chest[1], J.hip[1], 0.4)];
    this.ctx = ctx; this.a = a;
    const bp = new Path2D();
    bp.roundRect(c[0] - H * 0.075, c[1] - H * 0.11, H * 0.15, H * 0.22, H * 0.035);
    this.fillPath(bp, [96, 100, 108]);
    this.outline([[c[0] - H * 0.075, c[1] - H * 0.1], [c[0] - H * 0.075, c[1] + H * 0.1], [c[0] + H * 0.07, c[1] + H * 0.11]], H * 0.012, 0.9, false, 3);
  }

  drawHead(J, p, t) {
    const s = this.s, L = this.L, H = L.H, r = L.headR;
    const f = J.f;
    const ctx = this.ctx;
    const [hx, hy] = J.head;
    const tilt = (J.lean * 0.4 + J.hd) * f;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(tilt);
    const hair = colOf(s.hair ?? 0.92);
    const flutter = (k) => noise1(t * 2.6 + k, H) * 0.35 + Math.sin(t * 7 + k) * 0.12;
    // 脖子
    const nk = new Path2D();
    nk.rect(-r * 0.22, r * 0.55, r * 0.44, r * 0.55);
    this.fillPath(nk, C.skin);
    // 后面的发髻 / 马尾（在头后）
    if (s.style === 'ponytail') {
      const base = [-f * r * 0.8, -r * 0.3];
      const tail = [];
      for (let i = 0; i <= 6; i++) {
        const q = i / 6;
        tail.push([base[0] - f * q * r * 0.8 - f * q * q * r * 0.5 * (p.wind ?? 0.6), base[1] + q * r * 1.35 + Math.sin(t * 5 + q * 3) * r * 0.07]);
      }
      const cap = this.capsule(tail, tail.map((_, i) => r * lerp(0.55, 0.2, i / 6)));
      this.fillPath(cap.path, hair);
    }
    if (s.style === 'bun') {
      const bn = new Path2D();
      bn.arc(-f * r * 0.92, r * 0.12, r * 0.44, 0, TAU);
      this.fillPath(bn, hair);
    }
    if (s.style === 'buns') {
      for (const bx of [-f * r * 0.62, f * r * 0.38]) {
        const bn = new Path2D();
        bn.arc(bx, -r * 0.9, r * 0.42, 0, TAU);
        this.fillPath(bn, hair);
      }
    }
    // 脸（正圆，略偏向面朝方向）
    const face = new Path2D();
    face.ellipse(f * r * 0.04, r * 0.04, r * 0.98, r * 0.96, 0, 0, TAU);
    this.fillPath(face, C.skin);
    // 头发：额头上方一片墨
    if (s.style !== 'grandpa') {
      const hp = new Path2D();
      hp.moveTo(-f * r * 1.0, r * 0.25);
      hp.bezierCurveTo(-f * r * 1.15, -r * 0.9, f * r * 0.4, -r * 1.35, f * r * 0.98, -r * 0.2);
      hp.bezierCurveTo(f * r * 0.6, -r * 0.42, f * r * 0.1, -r * 0.35, -f * r * 0.15, -r * 0.5);
      hp.bezierCurveTo(-f * r * 0.35, -r * 0.1, -f * r * 0.55, r * 0.3, -f * r * 0.6, r * 0.6);
      hp.closePath();
      this.fillPath(hp, hair);
    } else {
      // 瓜皮帽
      const cp = new Path2D();
      cp.ellipse(-f * r * 0.02, -r * 0.3, r * 1.0, r * 0.75, 0, Math.PI, TAU);
      cp.closePath();
      this.fillPath(cp, inkRGB(0.88));
      const kn = new Path2D();
      kn.arc(-f * r * 0.02, -r * 1.05, r * 0.13, 0, TAU);
      this.fillPath(kn, inkRGB(0.95));
    }
    ctx.lineWidth = Math.max(0.5, H * 0.011);
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = rgba(inkRGB(0.8), 0.75 * this.a);
    ctx.stroke(face);
    // 红头绳：蝴蝶结在发髻上，两根飘带向脑后飘
    const ribbon = (x, y, len, kk) => {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      for (let j = 0; j < 2; j++) {
        const base = Math.atan2(0.75 + j * 0.45, -f);
        const ang = base + flutter(kk + j) * (p.wind ?? 1) * 0.5 * -f;
        const tail = [];
        for (let i = 0; i <= 6; i++) {
          const q = i / 6;
          tail.push([x + Math.cos(ang) * len * q - f * q * q * len * 0.35 * (p.wind ?? 0.6), y + Math.sin(ang) * len * q + Math.sin(t * 8 + q * 4 + kk + j) * len * 0.08 * q]);
        }
        stroke(ctx, tail, { w: r * 0.15, color: C.vermilion, alpha: 0.97 * this.a, dry: 0, taperIn: 0.05, taperOut: 0.5, seed: 90 + kk + j });
      }
      blob(ctx, x, y, r * 0.2, { fill: rgba(C.vermilion, 0.97 * this.a), sx: 1.5, sy: 0.85, seed: 80 + kk });
      ctx.restore();
    };
    if (s.style === 'buns') {
      ribbon(-f * r * 0.7, -r * 0.88, r * 0.9, 1);
      ribbon(f * r * 0.3, -r * 1.05, r * 0.75, 2);
    } else if (s.style === 'ponytail') {
      ribbon(-f * r * 0.82, -r * 0.3, r * 0.8, 3);
    }
    // 五官
    const eyeY = -r * 0.0 + (p.eyesDown ? r * 0.1 : 0) + (p.eyesUp ? -r * 0.08 : 0);
    const ex = f * r * 0.5;
    ctx.globalCompositeOperation = 'multiply';
    if (p.eyesClosed) {
      line(ctx, [[ex - r * 0.14, eyeY], [ex, eyeY + r * 0.07], [ex + r * 0.12, eyeY]], Math.max(0.5, r * 0.08), inkRGB(0.92), this.a);
      line(ctx, [[ex - f * r * 0.42 - r * 0.12, eyeY], [ex - f * r * 0.42, eyeY + r * 0.06], [ex - f * r * 0.42 + r * 0.1, eyeY]], Math.max(0.5, r * 0.08), inkRGB(0.92), this.a);
    } else {
      blob(ctx, ex, eyeY, Math.max(0.6, r * 0.12), { tone: 0.97, alpha: this.a, sides: 8, rough: 0.05, seed: 79 });
      blob(ctx, ex - f * r * 0.44, eyeY, Math.max(0.55, r * 0.11), { tone: 0.97, alpha: this.a, sides: 8, rough: 0.05, seed: 81 });
    }
    softDot(ctx, ex - f * r * 0.1, r * 0.34, r * 0.24, C.cheek, (s.style === 'grandpa' ? 0.3 : 0.6) * this.a);
    softDot(ctx, ex - f * r * 0.62, r * 0.34, r * 0.2, C.cheek, (s.style === 'grandpa' ? 0.2 : 0.45) * this.a);
    const mo = p.mouth ?? 'smile';
    const mx = f * r * 0.36, my = r * 0.46;
    if (mo === 'open') {
      blob(ctx, mx, my, r * 0.13, { fill: rgba([150, 64, 54], 0.9 * this.a), sx: 1, sy: 1.15, seed: 83 });
    } else if (mo === 'smile') {
      line(ctx, [[mx - r * 0.14, my - r * 0.02], [mx, my + r * 0.07], [mx + r * 0.12, my - r * 0.03]], Math.max(0.45, r * 0.075), inkRGB(0.85), 0.9 * this.a);
    } else if (mo === 'sad') {
      line(ctx, [[mx - r * 0.12, my + r * 0.05], [mx, my - r * 0.01], [mx + r * 0.1, my + r * 0.05]], Math.max(0.45, r * 0.07), inkRGB(0.85), 0.9 * this.a);
    } else {
      line(ctx, [[mx - r * 0.1, my + r * 0.02], [mx + r * 0.1, my + r * 0.02]], Math.max(0.45, r * 0.065), inkRGB(0.8), 0.8 * this.a);
    }
    if (s.style === 'grandpa') {
      const beard = [[f * r * -0.25, r * 0.5], [f * r * 0.25, r * 0.62], [f * r * 0.8, r * 0.45], [f * r * 0.6, r * 1.15], [f * r * 0.15, r * 1.5], [-f * r * 0.2, r * 1.05]];
      const W8 = whiteOf(ctx);
      if (W8) {
        W8.save();
        W8.globalAlpha = this.a;
        W8.beginPath();
        W8.moveTo(beard[0][0], beard[0][1]);
        for (const q of beard) W8.lineTo(q[0], q[1]);
        W8.closePath();
        W8.fillStyle = 'rgba(255,255,255,0.96)';
        W8.fill();
        W8.beginPath();
        W8.ellipse(-f * r * 0.7, r * 0.05, r * 0.24, r * 0.4, 0, 0, TAU);
        W8.fill();
        W8.beginPath();
        W8.ellipse(ex - f * r * 0.05, eyeY - r * 0.24, r * 0.2, r * 0.07, 0, 0, TAU);
        W8.ellipse(ex - f * r * 0.47, eyeY - r * 0.22, r * 0.17, r * 0.06, 0, 0, TAU);
        W8.fill();
        W8.restore();
      }
      stroke(ctx, [beard[2], beard[3], beard[4], beard[5]], { w: Math.max(0.5, H * 0.008), tone: 0.55, alpha: 0.65 * this.a, dry: 0.2, taperIn: 0.3, taperOut: 0.5, seed: 85 });
    }
    ctx.restore();
  }
}

// ---------- 姿势库 ----------
export const POSE = {
  stand: { lean: 0.02, head: 0, armF: [0.08, 0.12], armB: [-0.06, 0.1], legF: [0.06, 0.02], legB: [-0.05, 0.02] },
  standOld: { lean: 0.32, head: -0.28, armF: [0.55, 0.35], armB: [0.1, 0.4], legF: [0.18, 0.2], legB: [-0.02, 0.15] },
  sit: { lean: 0.05, head: 0, armF: [0.55, 0.75], armB: [0.45, 0.8], legF: [1.45, 1.5], legB: [1.4, 1.42] },
  sitOld: { lean: 0.28, head: -0.12, armF: [0.75, 0.6], armB: [0.6, 0.7], legF: [1.4, 1.45], legB: [1.35, 1.4] },
  doze: { lean: 0.42, head: 0.55, armF: [0.7, 0.55], armB: [0.55, 0.7], legF: [1.4, 1.45], legB: [1.35, 1.4], eyesClosed: true, mouth: 'line' },
  holdUp: { lean: -0.05, head: -0.35, armF: [-2.75, 0.25], armB: [-2.6, 0.3], legF: [0.12, 0.05], legB: [-0.1, 0.05] },
  wave: { lean: 0, head: 0, armF: [-2.6, -0.3], armB: [-0.06, 0.1], legF: [0.06, 0.02], legB: [-0.05, 0.02] },
  point: { lean: -0.05, head: -0.4, armF: [-2.35, -0.05], armB: [-0.1, 0.2], legF: [0.06, 0.02], legB: [-0.05, 0.02] },
  reach: { lean: 0.12, head: 0.05, armF: [1.25, 0.15], armB: [0.9, 0.3], legF: [0.15, 0.05], legB: [-0.12, 0.05] },
  holdReel: { lean: 0.02, head: -0.3, armF: [0.95, 0.7], armB: [0.75, 0.9], legF: [0.18, 0.05], legB: [-0.15, 0.05] },
  lookUp: { lean: -0.06, head: -0.45, armF: [0.15, 0.2], armB: [-0.05, 0.15], legF: [0.06, 0.02], legB: [-0.05, 0.02] },
  hug: { lean: 0.08, head: 0.25, armF: [0.85, 1.75], armB: [0.75, 1.85], legF: [0.05, 0.02], legB: [-0.04, 0.02], eyesDown: true, mouth: 'line' },
  crouch: { lean: 0.35, head: -0.1, armF: [0.9, 0.4], armB: [0.7, 0.5], legF: [1.1, 1.9], legB: [0.6, 1.7] },
  jump: { lean: -0.05, head: -0.25, armF: [-2.5, 0.2], armB: [-2.3, 0.3], legF: [0.35, 0.8], legB: [-0.1, 0.6] },
  paint: { lean: 0.22, head: 0.3, armF: [1.0, 0.95], armB: [0.75, 1.1], legF: [1.45, 1.5], legB: [1.4, 1.42], eyesDown: true },
};

// 走 / 跑循环。phase 以“一个完整步态周期”为 1
export function walk(phase, o = {}) {
  const a = o.stride ?? 0.4;
  const s = Math.sin(phase * TAU), c = Math.cos(phase * TAU);
  const arm = o.arm ?? 0.32;
  return {
    lean: o.lean ?? 0.05,
    head: o.head ?? 0,
    legF: [a * s, Math.max(0, c) * a * 1.4 + 0.05],
    legB: [-a * s, Math.max(0, -c) * a * 1.4 + 0.05],
    armF: [-arm * s, 0.25 + Math.max(0, -s) * 0.2],
    armB: [arm * s, 0.25 + Math.max(0, s) * 0.2],
  };
}
export function run(phase, o = {}) {
  const a = o.stride ?? 0.72;
  const s = Math.sin(phase * TAU), c = Math.cos(phase * TAU);
  return {
    lean: o.lean ?? 0.22,
    head: o.head ?? -0.15,
    legF: [a * s + 0.1, Math.max(0, c) * 1.6 + 0.25],
    legB: [-a * s + 0.1, Math.max(0, -c) * 1.6 + 0.25],
    armF: [-0.75 * s, 1.35],
    armB: [0.75 * s, 1.35],
    lift: Math.abs(Math.sin(phase * TAU * 2)) * (o.lift ?? 3),
  };
}

export function blend(a, b, t) {
  return mixv(a, b, clamp(t));
}
