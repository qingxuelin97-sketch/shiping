// v2 新增的五个特写：
//   S05B 线拐子交到小手里    S13B 爷爷放下挥着的手    S15B 红线磨断（慢镜头）
//   S16B 雪里拾起线拐子      S22B 女儿仰头大笑
// 另有 part()：把一个镜头按时间切成两段，中间插入特写。
import { drawMaster } from '../world/master.js';
import { Camera } from '../core/camera.js';
import { track, prog, clamp, lerp, Ease, TAU } from '../core/math.js';
import { hash } from '../core/noise.js';
import { softDot, whiteOf, line, rgba } from '../ink/brush.js';
import { GRANDPA, DAUGHTER } from '../actors/cast.js';
import { POSE } from '../actors/rig.js';
import { drawKite, drawReel, drawString } from '../actors/props.js';
import { drawHand, drawReelHi, drawFrayString, drawMum } from '../actors/closeup.js';
import { ground } from './common.js';
import { drawSnowfall } from '../world/particles.js';
import { C } from '../world/palette.js';

const GP_SLEEVE = [70, 76, 90], GP_CUFF = [104, 110, 124];
const G6_SLEEVE = [238, 192, 178], G6_CUFF = [246, 226, 214];
const MOURN_SLEEVE = [46, 46, 52], MOURN_CUFF = [74, 74, 80];
const WINTER_POST = { sat: 0.28, tint: [0.97, 0.99, 1.03] };
const WINTER_SKY = { top: [212, 218, 226], topAlpha: 0.85, horizon: [236, 238, 240], horAlpha: 0.5 };
const rotv = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];

// 把镜头切段：t0..t1 这一段，提示点与后期参数一起平移
export function part(shot, id, t0, t1, extra = {}) {
  const cues = (typeof shot.cues === 'function' ? shot.cues() : shot.cues || []).filter((c) => c.t >= t0 && c.t < t1).map((c) => ({ ...c, t: +(c.t - t0).toFixed(3) }));
  return {
    ...shot,
    id,
    dur: t1 - t0,
    cues,
    post: typeof shot.post === 'function' ? (t) => shot.post(t + t0) : shot.post,
    render: (ctx, t, R) => shot.render(ctx, t + t0, R),
    ...extra,
  };
}

// ---------------- S05B 爷爷布满皱纹的手，把线拐子放进小燕的小手里 ----------------
export const S05B = {
  id: 'S05B',
  dur: 3.0,
  amb: 'spring',
  post: { dof: 1, dofRadius: 7, vig: 0.8, tint: [1.03, 1.0, 0.95] },
  cues: [{ t: 1.15, kind: 'sfx', name: 'reel_tap' }, { t: 1.15, kind: 'hit', name: 'handover' }],
  render(ctx, t, R) {
    const cam = new Camera(1110 + t * 5, 470 - t * 2, 4.6);
    drawMaster(ctx, t + 48, R, {
      cam, season: 'spring', wind: 0.4, noGrass: true, beams: 0.9, petals: 5, petalSize: 2.0, petalRegion: [1040, 500, 1300, 720],
      frame: { corner: 'tl', kind: 'blossom', len: 760, dip: 0.3, blur: 16, alpha: 0.95, seed: 4 },
      actors: (c) => {
        c.setTransform(R.base, 0, 0, R.base, 0, 0);
        // ---- 小燕的两只手：手心向上，先低一点，迎上来，接住后往怀里收 ----
        const rise = track([[0, 70], [0.5, 70], [0.72, 80, 'inOutSine'], [1.1, 0, 'outCubic'], [2.2, 0], [3.0, 0]], t);
        const pull = prog(t, 2.2, 3.0, 'inOutSine');
        const hOff = [-pull * 60, rise + pull * 44];
        const gc = track([[0, 0.2], [1.2, 0.2], [1.85, 0.72, 'outCubic'], [3, 0.78]], t);
        const handU = { x: 540 + hOff[0], y: 770 + hOff[1], ang: -0.62, s: 190, kind: 'child', view: 'palm', curl: [gc, gc * 1.05, gc * 1.08, gc * 1.1], thumb: 0.15 + gc * 0.3, thumbA: -0.9, sleeve: G6_SLEEVE, cuff: G6_CUFF, sleeveLen: 700, seed: 11 };
        const handL = { ...handU, x: 720 + hOff[0], y: 845 + hOff[1], ang: -0.82, mirror: true, seed: 12 };
        drawHand(c, handL);
        drawHand(c, handU);
        // ---- 线拐子：从爷爷手里落到小手上 ----
        const sr = 125;
        const k1 = prog(t, 0.05, 1.15, 'inOutSine');
        const A = [1480, 170], B = [720, 660];
        const lift = -Math.sin(clamp(t / 0.32) * Math.PI) * 14;
        const settle = t > 1.15 ? Math.sin((t - 1.15) * 14) * Math.exp(-(t - 1.15) * 7) * 8 : 0;
        const RC = t < 1.15
          ? [lerp(A[0], B[0], k1), lerp(A[1], B[1], k1) + lift - Math.sin(k1 * Math.PI) * 60]
          : [B[0] + hOff[0], B[1] + hOff[1] + settle];
        const rot = lerp(-0.35, 0.55, k1);
        // 线头垂下去
        const sp = add(RC, rotv([-sr * 0.3, sr * 0.45], rot));
        drawString(c, sp, [sp[0] - 200, 1140], { width: 5, t, sag: 0.18, wobble: 3 });
        drawReelHi(c, RC[0], RC[1], sr, rot, {});
        if (gc > 0.3) {
          drawHand(c, { ...handL, only: 'fingers' });
          drawHand(c, { ...handU, only: 'fingers' });
        }
        // ---- 爷爷的手：握着右边的梁送下来；放下后松开，在她的手上停一停，再收回 ----
        const sg = 230;
        const grip = add(RC, rotv([sr * 0.82, -sr * 0.22], rot));
        const angAtt = rot + Math.PI + 0.22;
        const dir = [Math.cos(angAtt), Math.sin(angAtt)];
        const wAtt = [grip[0] - dir[0] * sg * 0.9, grip[1] - dir[1] * sg * 0.9];
        // 停在她手上的位置（以 1.15 秒时为基准）
        const gripB = add([B[0], B[1]], rotv([sr * 0.82, -sr * 0.22], 0.55));
        const angB = 0.55 + Math.PI + 0.22;
        const wB = [gripB[0] - Math.cos(angB) * sg * 0.9, gripB[1] - Math.sin(angB) * sg * 0.9];
        const rest = prog(t, 1.25, 1.9, 'inOutSine');
        const away = prog(t, 2.35, 3.0, 'inQuad');
        let wx, wy, ang;
        if (t < 1.15) { [wx, wy] = wAtt; ang = angAtt; } else {
          wx = wB[0] + rest * -20 + hOff[0] * rest + away * 380;
          wy = wB[1] + rest * 70 + hOff[1] * rest - away * 420;
          ang = angB + rest * 0.16 - away * 0.25;
        }
        const relax = prog(t, 1.2, 1.6, 'inOutSine');
        const stroke1 = Math.sin(prog(t, 1.9, 2.35) * Math.PI);
        drawHand(c, { x: wx, y: wy, ang, s: sg, kind: 'old', view: 'back', curl: [lerp(0.92, 0.32, relax), lerp(0.95, 0.36, relax), lerp(0.95, 0.4, relax), lerp(0.9, 0.46, relax)], thumb: lerp(0.35, 0.15, relax) + stroke1 * 0.3, thumbA: -0.55, mirror: true, sleeve: GP_SLEEVE, cuff: GP_CUFF, sleeveLen: 900, seed: 21 });
      },
    });
  },
};

// ---------------- S13B 爷爷近景：挥着的手慢慢放下，笑容淡去 ----------------
export const S13B = {
  id: 'S13B',
  dur: 3.0,
  amb: 'morning',
  post: { dof: 1, dofRadius: 6, vig: 0.8, tint: [1.02, 1.0, 0.96] },
  cues: [{ t: 0.9, kind: 'hit', name: 'wave_down' }],
  render(ctx, t, R) {
    const x = 1168;
    const wave = Math.sin(t * 6.2) * 0.22 * (1 - prog(t, 0.3, 1.2));
    const armF = track([[0, [-2.42, -0.3]], [0.9, [-2.38, -0.28]], [1.65, [-1.1, -1.05], 'inOutSine'], [2.5, [0.12, 0.34], 'inOutSine']], t);
    const pose = {
      ...POSE.stand, expr: 'happy', x, y: ground(x), facing: -1,
      armF: [armF[0] + wave, armF[1]], armB: [0.25, 0.9],
      smile: track([[0, 0.9], [0.9, 0.85], [2.1, 0.05, 'inOutSine'], [3.0, -0.12]], t),
      tilt: track([[0, 0.05], [1.2, 0.05], [2.5, -0.32, 'inOutSine']], t),
      brow: track([[0, 0.08], [2.5, 0.0]], t),
      head: track([[0, -0.05], [1.8, -0.03], [3.0, 0.13, 'inOutSine']], t),
      lean: track([[0, 0.04], [3.0, 0.13, 'inOutSine']], t),
      eyesDown: t > 2.55,
      rim: { dir: [-0.82, -0.55], col: [255, 222, 182], a: 0.55, w: 2.2 },
      wind: 0.4,
    };
    const J0 = GRANDPA.joints({ ...pose, armF: [0.1, 0.3] });
    const cam = new Camera(J0.head[0] - 16, J0.head[1] + 7, lerp(17.0, 17.6, t / 3));
    drawMaster(ctx, t + 162, R, {
      cam, season: 'summer', wind: 0.35, smoke: 0.8, noGrass: true, sky: { horizon: [250, 236, 216], horAlpha: 0.45 },
      actors: (c) => {
        const GJ = GRANDPA.draw(c, pose, t);
        drawKite(c, { x: GJ.armB.hand[0] + 4, y: GJ.armB.hand[1] - 2, size: 17, rot: -1.2, sx: 0.55, lineW: 0.6, patch: 1 });
      },
    });
  },
};

// ---------------- S15B 红线一缕缕磨断（慢镜头） ----------------
export const S15B = {
  id: 'S15B',
  dur: 2.6,
  amb: 'winter_wind',
  post: { ...WINTER_POST, dof: 1, dofRadius: 6, vig: 0.95 },
  cues: [0.48, 0.8, 1.12].map((t, i) => ({ t, kind: 'sfx', name: 'fiber', i })).concat([{ t: 1.55, kind: 'sfx', name: 'snap_slow' }, { t: 1.55, kind: 'hit', name: 'snap' }]),
  render(ctx, t, R) {
    const cam = new Camera(1010, 330, 4.2);
    drawMaster(ctx, 208 + t * 0.3, R, {
      cam, season: 'winter', wind: 0.4, noGrass: true, sky: WINTER_SKY,
      actors: (c) => {
        c.setTransform(R.base, 0, 0, R.base, 0, 0);
        const push = 1 + t * 0.03;
        c.translate(900, 470);
        c.scale(push, push);
        c.translate(-900, -470);
        // 线拐子与爷爷松松握着的手（右下角）
        const RC = [1560, 880], rot = -0.5, sr = 150;
        drawReelHi(c, RC[0], RC[1], sr, rot, { snow: 0.3 });
        const bar = add(RC, rotv([sr * 0.82, -sr * 0.1], rot));
        const ang = rot + Math.PI + 0.25, sg = 190;
        drawHand(c, { x: bar[0] - Math.cos(ang) * sg * 0.9, y: bar[1] - Math.sin(ang) * sg * 0.9, ang, s: sg, kind: 'old', view: 'back', curl: [0.62, 0.7, 0.76, 0.8], thumb: 0.3, thumbA: -0.5, mirror: true, sleeve: GP_SLEEVE, cuff: GP_CUFF, sleeveLen: 700, seed: 31 });
        // 红线：从线轴伸向左上角的天空
        const a = add(RC, rotv([-sr * 0.2, -sr * 0.5], rot));
        const b = [-220, -300];
        const fray = prog(t, 0.3, 1.45, 'linear');
        const after = t >= 1.55 ? (t - 1.55) * 0.55 : -1;
        drawFrayString(c, a, b, { t: t * 0.35, w: 22, fray, after, at: 0.36, vib: 0.35 + fray * 0.8 });
        // 慢镜头里的雪
        drawSnowfall(c, 3 + t * 0.22, { count: 46, vx: -12, vy: 26, size: 7, seed: 9 });
      },
    });
  },
};

// ---------------- S16B 雪里，她的手拾起线拐子，白菊在旁 ----------------
export const S16B = {
  id: 'S16B',
  dur: 3.0,
  amb: 'winter',
  post: { ...WINTER_POST, dof: 1, dofRadius: 6, vig: 0.9 },
  cues: [{ t: 1.05, kind: 'sfx', name: 'snow_brush' }, { t: 1.9, kind: 'sfx', name: 'reel_lift' }, { t: 1.9, kind: 'hit', name: 'pickup' }],
  render(ctx, t, R) {
    const cam = new Camera(1212, 700, 6.0);
    drawMaster(ctx, 238 + t, R, {
      cam, season: 'winter', wind: 0.3, noGrass: true, sky: WINTER_SKY,
      actors: (c) => {
        c.setTransform(R.base, 0, 0, R.base, 0, 0);
        // ---- 凳面：木板 + 积雪（雪面有冷灰的起伏和影子，边上露出木头） ----
        const board = [[90, 650], [1830, 610], [1880, 880], [40, 930]];
        const bp = new Path2D();
        bp.moveTo(board[0][0], board[0][1]);
        for (const q of board) bp.lineTo(q[0], q[1]);
        bp.closePath();
        c.save();
        c.fillStyle = rgba(C.wood.map((v) => v * 0.9), 1);
        c.fill(bp);
        c.fillStyle = rgba(C.wood.map((v) => v * 0.66), 1);
        c.beginPath();
        c.moveTo(40, 930); c.lineTo(1880, 880); c.lineTo(1880, 960); c.lineTo(40, 1014); c.closePath();
        c.fill();
        c.globalCompositeOperation = 'multiply';
        for (let k = 0; k < 7; k++) line(c, [[90, 690 + k * 34], [1840, 650 + k * 33]], 1.4, [120, 90, 64], 0.35);
        line(c, [[40, 930], [1880, 880]], 3, [70, 52, 40], 0.8);
        c.restore();
        // 雪：先在前景层铺一层冷灰白，再叠白粉；影子处把白粉擦淡
        const snowPath = new Path2D();
        snowPath.moveTo(110, 662);
        for (let k = 0; k <= 30; k++) snowPath.lineTo(lerp(110, 1810, k / 30), lerp(662, 624, k / 30) - 6 - hash(k, 5) * 18);
        for (let k = 30; k >= 0; k--) snowPath.lineTo(lerp(80, 1850, k / 30), lerp(900, 852, k / 30) + 4 + hash(k, 9) * 14);
        snowPath.closePath();
        c.save();
        c.fillStyle = rgba([226, 230, 238], 1);
        c.fill(snowPath);
        c.restore();
        const W8 = whiteOf(c);
        if (W8) {
          W8.save();
          W8.globalAlpha = 0.9;
          W8.fillStyle = '#fff';
          W8.fill(snowPath);
          // 雪面起伏：几道擦淡的弧
          W8.globalCompositeOperation = 'destination-out';
          for (let k = 0; k < 9; k++) {
            const x = 200 + k * 190 + hash(k, 2) * 60, y = 760 + hash(k, 4) * 90;
            softDot(W8, x, y, 70 + hash(k, 6) * 60, [0, 0, 0], 0.18, 0.4);
          }
          // 线拐子和白菊的影子
          softDot(W8, 990, 760, 150, [0, 0, 0], 0.55, 0.4);
          softDot(W8, 1440, 742, 120, [0, 0, 0], 0.45, 0.4);
          W8.restore();
        }
        c.save();
        c.globalCompositeOperation = 'multiply';
        softDot(c, 990, 760, 150, [196, 202, 214], 0.7, 0.4);
        softDot(c, 1440, 742, 120, [196, 202, 214], 0.6, 0.4);
        c.restore();
        // ---- 白菊：花瓣先垫一层暖白，再叠白粉，轮廓用淡墨 ----
        c.save();
        c.globalCompositeOperation = 'multiply';
        softDot(c, 1420, 700, 110, [236, 228, 206], 0.9, 0.35);
        c.restore();
        drawMum(c, 1420, 700, 96, -0.35, { squash: 0.62 });
        // ---- 线拐子与线 ----
        const lift = prog(t, 2.1, 3.0, 'inCubic');
        const RC = [lerp(960, 820, lift), lerp(712, 120, lift)];
        const rot = lerp(1.45, 1.05, lift);
        const brush = prog(t, 1.0, 1.65);
        const snowAmt = 1 - brush * 0.7;
        const sp = add(RC, rotv([0, 120 * 0.55], rot));
        drawString(c, sp, [lerp(420, 640, lift), lerp(980, 1120, lift)], { width: 4, t, sag: 0.08 + lift * 0.2, wobble: 1.5 });
        // 线压在雪上的浅痕
        if (W8) {
          W8.save();
          W8.globalCompositeOperation = 'destination-out';
          W8.globalAlpha = 0.25;
          W8.lineWidth = 7;
          W8.beginPath();
          W8.moveTo(sp[0], sp[1] + 4);
          W8.lineTo(lerp(sp[0], 420, 0.8), lerp(sp[1], 900, 0.8));
          W8.stroke();
          W8.restore();
        }
        drawReelHi(c, RC[0], RC[1], 120, rot, { snow: snowAmt });
        // 拂雪时扬起的雪粉
        if (brush > 0 && brush < 1 && W8) {
          for (let i = 0; i < 10; i++) {
            const age = (brush * 3 + i / 10) % 1;
            const a = hash(i, 3) * Math.PI - Math.PI;
            softDot(W8, RC[0] + Math.cos(a) * (60 + age * 140), RC[1] - 40 + Math.sin(a) * age * 90, 6 + age * 10, [255, 255, 255], 0.7 * (1 - age), 0.5);
          }
        }
        // ---- 她的手：从左上伸进来，拂去雪，握住，拿起 ----
        const sh = 150, ang = 0.95;
        const d = [Math.cos(ang), Math.sin(ang)];
        const enter = prog(t, 0.25, 1.0, 'outCubic');
        const sweep = Math.sin(prog(t, 1.0, 1.65) * Math.PI * 2) * 46;
        const grasp = prog(t, 1.65, 2.0, 'inOutSine');
        const back = lerp(1.3, 0.95, grasp) * sh;
        const lat = sweep * (1 - grasp);
        let wx = RC[0] - d[0] * back - d[1] * lat, wy = RC[1] - d[1] * back + d[0] * lat;
        wx = lerp(wx - 900, wx, enter);
        wy = lerp(wy - 700, wy, enter);
        const cu = lerp(0.12, 0.84, grasp);
        drawHand(c, { x: wx, y: wy, ang: ang + lift * 0.3, s: sh, kind: 'adult', view: 'back', curl: [cu, cu * 1.04, cu * 1.08, cu * 1.1], thumb: 0.2 + grasp * 0.35, thumbA: -0.55, sleeve: MOURN_SLEEVE, cuff: MOURN_CUFF, sleeveLen: 900, seed: 41 });
        drawSnowfall(c, 5 + t * 0.6, { count: 50, vx: -8, vy: 34, size: 4.5, seed: 13 });
      },
    });
  },
};

// ---------------- S22B 女儿仰头大笑，头绳飘起 ----------------
export const S22B = {
  id: 'S22B',
  dur: 2.5,
  amb: 'sky',
  post: { dof: 1, dofRadius: 6, vig: 0.75, tint: [1.02, 1.0, 0.96] },
  cues: [{ t: 0.15, kind: 'sfx', name: 'giggle' }, { t: 0.1, kind: 'hit', name: 'laugh' }],
  render(ctx, t, R) {
    const x = 1388;
    const pose0 = { ...POSE.holdReel, head: -0.55, x, y: ground(x), facing: -1 };
    const J = DAUGHTER.joints(pose0);
    const cam = new Camera(J.head[0] + 14, J.head[1] + 9, 18.0 + t * 0.25);
    drawMaster(ctx, t + 392, R, {
      cam, season: 'spring', wind: 0.7, noGrass: true, petals: 9, petalSize: 1.5, petalWind: 50,
      petalRegion: [J.head[0] - 130, J.head[1] - 80, J.head[0] + 130, J.head[1] + 90],
      frame: { corner: 'tr', kind: 'blossom', len: 520, dip: 0.3, blur: 16, alpha: 0.9, seed: 7 },
      actors: (c) => {
        const ha = Math.sin(t * 14.5);
        const decay = 1 - prog(t, 1.4, 2.5) * 0.6;
        const pose = {
          ...pose0, expr: 'laugh', mouth: ha > -0.2 ? 'grin' : 'open',
          lift: (ha * 0.5 + 0.5) * 0.7 * decay, head: -0.55 + ha * 0.025 * decay,
          wind: 1.3, v: [70, -10 * ha], rim: { dir: [-0.55, -0.83], col: [255, 228, 190], a: 0.5, w: 2.0 },
        };
        // 先按同一姿势算出手的位置，把线拐子画在手下面，手指握在上面
        const JJ = DAUGHTER.joints(DAUGHTER.idle(pose, t));
        const hp = JJ.armF.wrist;
        drawString(c, hp, [hp[0] - 320, hp[1] - 620], { width: 0.5, t, sag: 0.02, wobble: 0.6 });
        drawReelHi(c, hp[0] - 2.5, hp[1] + 1, 5.2, 0.5, {});
        DAUGHTER.draw(c, pose, t);
      },
    });
  },
};

export { TAU, Ease };
