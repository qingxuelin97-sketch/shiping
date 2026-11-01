// 第一幕 · 春：墨滴、扎风筝、初飞、片名
import { drawMaster } from '../world/master.js';
import { MASTER_RANGES, drawRange, drawMist } from '../world/mountains.js';
import { drawSky } from '../world/landscape.js';
import { drawClouds } from '../world/sky.js';
import { Camera, applyCamera } from '../core/camera.js';
import { track, prog, clamp, lerp, Ease, TAU, mixv } from '../core/math.js';
import { noise1, hash } from '../core/noise.js';
import { blob, rgba, inkRGB, softDot, fgOf } from '../ink/brush.js';
import { GRANDPA, GIRL6 } from '../actors/cast.js';
import { POSE, walk, run, hop, withVel } from '../actors/rig.js';
import { drawKite, drawString, drawReel, kiteBridle, kiteFrameTip, kitePaintTip, drawFlock, drawKnot } from '../actors/props.js';
import { ground, STOOL_X, stoolY, SEAT, stool, pathAt, depthScale, scaled, kiteWobble, inkText, seal, insertBg, drawBrushTool, drawArmIn, footsteps } from './common.js';
import { C } from '../world/palette.js';
import { writeColumn } from '../type/write.js';

const SLEEVE = [84, 86, 92];

// 巨大的头（特写里从画框边探进来）
export function bigHead(ctx, fig, hx, hy, k, pose, t) {
  const H = fig.L.H, r = fig.L.headR;
  const footY = hy + (H - r * 1.2) * k;
  scaled(ctx, hx, footY, k, () => fig.draw(ctx, { ...POSE.stand, ...pose, x: hx, y: footY }, t));
}

// ---------------- S01 墨滴落纸，晕开成远山 ----------------
export const S01 = {
  id: 'S01',
  dur: 10,
  cues: [
    { t: 0.95, kind: 'sfx', name: 'inkdrop' },
    { t: 1.2, kind: 'sfx', name: 'bloom' },
    { t: 3.3, kind: 'hit', name: 'poem1' },
    { t: 4.7, kind: 'hit', name: 'poem2' },
  ],
  render(ctx, t, R) {
    const cam = new Camera(960, 552 - t * 1.2, 1);
    ctx.setTransform(R.base, 0, 0, R.base, 0, 0);
    drawSky(ctx, {});
    const reveal = prog(t, 1.25, 7.0, 'inOutSine');
    if (reveal > 0) {
      MASTER_RANGES.forEach((L, i) => {
        drawRange(ctx, L, cam, R.base, { color: inkRGB(L.tone).map(Math.round) });
        drawMist(ctx, cam, R.base, [{ y: 650 + i * 80, x0: -600, x1: 2600, w: 600, h: 66, alpha: 0.9, parallax: L.parallax + 0.04, speed: 6, seed: 2 + i * 2, puffs: 8 }], t);
      });
      ctx.setTransform(R.base, 0, 0, R.base, 0, 0);
      const Rr = lerp(10, 1700, reveal);
      const g = ctx.createRadialGradient(960, 470, Rr * 0.45, 960, 470, Rr);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1920, 1080);
    }
    ctx.setTransform(R.base, 0, 0, R.base, 0, 0);
    // 墨滴落下
    if (t < 1.0) {
      const y = lerp(-40, 470, Ease.inQuad(clamp(t / 1.0)));
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgba(inkRGB(0.95), 1);
      ctx.beginPath();
      ctx.ellipse(960, y, 6, 9 + 6 * t, 0, 0, TAU);
      ctx.fill();
    }
    // 晕开
    if (t >= 0.95) {
      const b = prog(t, 0.95, 5.5, 'outCubic');
      const fade = 1 - prog(t, 2.2, 7.5, 'inOutSine');
      const rad = lerp(5, 330, b);
      ctx.globalCompositeOperation = 'multiply';
      softDot(ctx, 960, 470, rad * 1.25, inkRGB(0.55), 0.55 * fade, 0.8);
      for (let k = 0; k < 9; k++) {
        const a = hash(k, 3) * TAU;
        const rr = rad * (0.25 + hash(k, 5) * 0.5);
        blob(ctx, 960 + Math.cos(a) * rr * 0.5, 470 + Math.sin(a) * rr * 0.35, rr * 0.7, { tone: 0.85, alpha: 0.32 * fade, rough: 0.35, seed: k, sides: 28 });
      }
      blob(ctx, 960, 470, rad * 0.35, { tone: 0.95, alpha: 0.8 * fade * (1 - b * 0.5), rough: 0.3, seed: 40, sides: 30 });
    }
    // 题诗（竖排，自右向左）
    const fade = 1 - prog(t, 8.4, 9.8, 'inOutSine');
    // 题诗按笔顺逐字写出
    writeColumn(ctx, '儿童散学归来早', 1610, 250, 62, 57, prog(t, 3.2, 6.1, 'linear'), { alpha: fade, tone: 0.88 });
    writeColumn(ctx, '忙趁东风放纸鸢', 1530, 300, 62, 57, prog(t, 4.6, 7.5, 'linear'), { alpha: fade, tone: 0.88 });
    inkText(ctx, '清 · 高鼎《村居》', 1452, 520, { vertical: true, size: 26, p: prog(t, 6.6, 7.6) * fade, tone: 0.6, font: 'ZCOOLXiaoWei' });
  },
};

// ---------------- S02 山坡全景：祖孙上山 ----------------
export const S02 = {
  id: 'S02',
  dur: 8,
  cues: [{ t: 0.5, kind: 'sfx', name: 'swallows' }],
  render(ctx, t, R) {
    const k = prog(t, 0, 8, 'inOutSine');
    const cam = new Camera(lerp(960, 1000, k), lerp(540, 552, k), lerp(1.0, 1.07, k));
    drawMaster(ctx, t + 20, R, {
      cam, season: 'spring', smoke: 1, petals: 16, wind: 0.5, beams: 0.6, clouds: 0.5,
      actors: (c) => {
        const walker = (fig, s0, s1, extra = {}) => {
          const s = lerp(s0, s1, t / 8);
          const pos = pathAt(s);
          const sc = depthScale(pos[1]);
          const dist = (s0 - s) * 900;
          scaled(c, pos[0], pos[1], sc, () => fig.draw(c, { ...walk(dist / (fig.L.H * 0.95), { stride: 0.42 }), ...extra, x: pos[0], y: pos[1], facing: 1 }, t));
          return { pos, sc };
        };
        const g = walker(GRANDPA, 0.8, 0.6);
        // 爷爷肩上扛着一捆竹篾
        scaled(c, g.pos[0], g.pos[1], g.sc, () => {
          c.save();
          c.globalCompositeOperation = 'multiply';
          for (let i = 0; i < 4; i++) {
            const y0 = g.pos[1] - 92 + i * 1.5;
            c.strokeStyle = rgba(C.bamboo.map((v) => v * 0.85), 1);
            c.lineWidth = 1.6;
            c.beginPath();
            c.moveTo(g.pos[0] - 34, y0 + 14);
            c.lineTo(g.pos[0] + 30, y0 - 12 - i * 2);
            c.stroke();
          }
          c.restore();
        });
        walker(GIRL6, 0.66, 0.43, { mouth: 'open', wind: 0.8 });
      },
      front: (c) => {
        drawFlock(c, t, { count: 2, seed: 3, speed: 0.12, spread: 0.05, size: 10, jitter: 14, path: (u, i) => [lerp(2050, -200, u), 300 + Math.sin(u * 7 + i * 1.5) * 70 + i * 22] });
      },
    });
  },
};

// ---------------- S03 留白特写：竹骨自己“画”出来 ----------------
const INSERT_KITE = { x: 960, y: 520, size: 360, rot: -0.04 };
export const S03 = {
  id: 'S03',
  dur: 8,
  post: { vig: 0.8, wobble: 0.8 },
  cues: [0.9, 2.1, 3.3, 4.5, 5.7].map((t, i) => ({ t, kind: 'sfx', name: 'bamboo', i })),
  render(ctx, t, R) {
    insertBg(ctx, { base: R.base });
    ctx.setTransform(R.base, 0, 0, R.base, 0, 0);
    // 桌上的竹篾和线拐子
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = rgba(C.bamboo.map((v) => v * 0.8), 0.95);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(120 + i * 6, 960 - i * 9);
      ctx.lineTo(560 + i * 4, 880 - i * 11);
      ctx.stroke();
    }
    ctx.restore();
    drawReel(ctx, 1600, 900, 70, 0.25);
    const fr = prog(t, 0.7, 6.9, 'inOutSine');
    drawKite(ctx, { ...INSERT_KITE, frame: fr, paper: 0, lineW: 3.2 });
    const tip = kiteFrameTip(INSERT_KITE, fr);
    const hand = [tip[0] + 24, tip[1] + 30];
    const enter = prog(t, 0.0, 0.8, 'outCubic') * (1 - prog(t, 7.2, 8, 'inCubic'));
    const H2 = [lerp(1800, hand[0], enter), lerp(1300, hand[1], enter)];
    drawArmIn(fgOf(ctx), [H2[0] + 330, H2[1] + 300], H2, 74, SLEEVE);
  },
};

// ---------------- S04 毛笔描出沙燕，小燕探头 ----------------
export const S04 = {
  id: 'S04',
  dur: 8,
  post: { vig: 0.8, wobble: 0.8 },
  cues: [{ t: 0.3, kind: 'sfx', name: 'paper' }, { t: 1.5, kind: 'sfx', name: 'brush' }, { t: 3.6, kind: 'sfx', name: 'brush' }, { t: 4.4, kind: 'hit', name: 'peek' }],
  render(ctx, t, R) {
    insertBg(ctx, { base: R.base });
    ctx.setTransform(R.base, 0, 0, R.base, 0, 0);
    drawReel(ctx, 1600, 900, 70, 0.25);
    const paper = prog(t, 0, 1.1);
    const paint = prog(t, 1.4, 6.8, 'inOutSine');
    drawKite(ctx, { ...INSERT_KITE, frame: 1, paper, paint, lineW: 3.2 });
    // 毛笔与手
    const on = prog(t, 0.9, 1.5, 'outCubic') * (1 - prog(t, 7.0, 7.8, 'inCubic'));
    if (on > 0) {
      const tip = kitePaintTip(INSERT_KITE, paint);
      const lift = Math.abs(Math.sin(paint * 60)) * 6;
      const ang = -0.95;
      const tp = [lerp(1750, tip[0], on), lerp(-50, tip[1] - lift, on)];
      drawBrushTool(fgOf(ctx), tp, ang, 300);
      const hand = [tp[0] + Math.cos(ang) * 230, tp[1] + Math.sin(ang) * 230];
      drawArmIn(fgOf(ctx), [hand[0] + 300, hand[1] - 240], hand, 74, SLEEVE);
    }
    // 小燕从左下角探出脑袋
    const peek = prog(t, 4.3, 5.4, 'outBack');
    if (peek > 0) {
      const hx = lerp(-180, 300, peek), hy = lerp(1200, 880, peek);
      bigHead(fgOf(ctx), GIRL6, hx, hy, 14, { facing: 1, head: -0.2 + Math.sin(t * 2) * 0.03, mouth: t < 6.3 ? 'open' : 'smile', eyesUp: true, wind: 0.2, armF: [0.3, 0.4] }, t);
    }
  },
};

// ---------------- S05 中景：爷爷举起风筝，交给小燕线拐子 ----------------
const KITE_HOLD = (J) => {
  const h = [(J.armF.hand[0] + J.armB.hand[0]) / 2, (J.armF.hand[1] + J.armB.hand[1]) / 2];
  return { x: h[0], y: h[1] - 26, size: 40 };
};
export const S05 = {
  id: 'S05',
  dur: 8,
  post: { dof: 0.45, dofRadius: 3.5 },
  cues: [{ t: 0.62, kind: 'hit', name: 'raise' }, { t: 0.55, kind: 'sfx', name: 'jump' }, { t: 1.6, kind: 'sfx', name: 'jump' }, { t: 2.75, kind: 'sfx', name: 'clap' }, { t: 4.9, kind: 'hit', name: 'handover' }],
  render(ctx, t, R) {
    const cam = new Camera(1176, 664, 3.3).withShake(t, 1.2, 0.3, 5);
    drawMaster(ctx, t + 40, R, {
      cam, season: 'spring', wind: 0.4, petals: 12, petalSize: 2.4, petalRegion: [1000, 520, 1400, 800], beams: 0.7,
      frame: { corner: 'tr', kind: 'blossom', len: 470, dip: 0.3, blur: 14, alpha: 0.92, seed: 2 },
      actors: (c) => {
        stool(c);
        // 爷爷：先把风筝往怀里一收（预备），再举过头顶（过冲、回稳）；放下；递出线拐子
        const PRE = { ...POSE.sit, armF: [-1.2, 0.85], armB: [-1.1, 0.9], head: -0.05, lean: 0.14 };
        const UP = { ...POSE.sit, armF: [-2.65, 0.25], armB: [-2.5, 0.3], head: -0.35, lean: -0.02 };
        const LAP = { ...POSE.sit, armF: [0.6, 0.7], armB: [0.5, 0.75], head: 0.05 };
        const GIVE = { ...POSE.sit, armF: [1.2, 0.25], armB: [0.5, 0.75], head: 0.12, lean: 0.16 };
        const gp = track([[0, PRE], [0.25, PRE, 'anticip'], [0.9, UP], [3.0, UP, 'inOutSine'], [3.7, LAP], [4.2, LAP, 'inOutSine'], [4.8, GIVE, 'settle'], [5.6, GIVE, 'inOutSine'], [6.4, LAP]], t);
        const gx = STOOL_X + 3, gy = stoolY();
        const J = GRANDPA.draw(c, { ...gp, x: gx, y: gy, sit: SEAT, facing: -1, smile: t < 4.2 ? 0.95 : 0.8, rim: { dir: [0.6, -0.8], col: [255, 236, 206], a: 0.4, w: 1.4 } }, t);
        if (t < 3.6) {
          const k = KITE_HOLD(J);
          drawKite(c, { ...k, rot: Math.sin(t * 2.4) * 0.06, lineW: 0.9 });
        } else {
          drawKite(c, { x: gx + 34, y: gy - 30, size: 40, rot: 0.42, lineW: 0.9 });
        }
        // 小燕：两次起跳（预备下蹲、腾空、落地缓冲）→ 拍手 → 伸手接 → 抱在怀里
        const girlX = 1150;
        const gpose = (tt) => {
          let q;
          if (tt < 0.3) q = { ...POSE.stand, expr: 'joy' };
          else if (tt < 2.5) {
            const ph = ((tt - 0.3) / 1.1) % 1;
            q = { ...hop(ph, { height: 14 }), expr: 'joy' };
          } else if (tt < 3.4) {
            const cl = Math.abs(Math.sin((tt - 2.5) * Math.PI * 3.2));
            q = { ...mixv(POSE.clap, { ...POSE.clap, armF: [0.7, 0.9], armB: [0.6, 1.0] }, cl), expr: 'laugh' };
          } else {
            q = track([[3.4, { ...POSE.stand, expr: 'joy' }], [4.0, { ...POSE.stand, lean: -0.04, expr: 'joy' }, 'anticip'], [4.6, { ...POSE.reach, expr: 'joy' }], [5.3, { ...POSE.reach, expr: 'happy' }, 'inOutSine'], [6.0, { ...POSE.hug, eyesDown: false, expr: 'happy', head: -0.1 }]], tt);
          }
          return { ...q, x: girlX, y: ground(girlX), facing: 1, wind: 0.6 };
        };
        const GJ = GIRL6.draw(c, withVel(gpose, t), t);
        // 线拐子：先在爷爷手里，5.2 秒后到小燕怀里
        const reelP = t < 5.2 ? (t < 4.2 ? null : J.armF.hand) : [(GJ.armF.hand[0] + GJ.armB.hand[0]) / 2, (GJ.armF.hand[1] + GJ.armB.hand[1]) / 2];
        if (reelP) drawReel(c, reelP[0], reelP[1] - 2, 7, 0.2);
        else drawReel(c, gx + 6, gy - SEAT - 6, 7, 1.3);
      },
    });
  },
};

// ---------------- S06 初飞：栽跟头 → 爷爷托起 → 起飞 ----------------
const LAUNCH_DIP = { ...POSE.holdUp, armF: [-2.45, 0.55], armB: [-2.3, 0.6], lean: 0.08, legF: [0.28, 0.35], legB: [0.02, 0.3] };
export function launchShot(id, FLYER, HELPER, o = {}) {
  return {
    id,
    dur: 12,
    post: { dof: 0.3, dofRadius: 3 },
    cues: [
      // 跑：与画面上的跑步相位同步（run 的落地相位约 0.06）
      ...footsteps((t) => (lerp(1060, 1320, prog(t, 0.5, 3.4, 'inOutSine')) - 1060) / 42, 0.5, 3.35, { offset: 0.06, surface: 'grass', vel: 0.5, pan: (t) => (lerp(1060, 1320, prog(t, 0.5, 3.4, 'inOutSine')) - 1130) / 420, who: 'child' }),
      // 大人走过去捡风筝、再走回来
      ...footsteps((t) => (1352 - lerp(1352, 1150, prog(t, 3.2, 4.6, 'inOutSine'))) / 95, 3.2, 4.6, { surface: 'grass', vel: 0.55, pan: (t) => (lerp(1352, 1150, prog(t, 3.2, 4.6, 'inOutSine')) - 1130) / 420 }),
      ...footsteps((t) => (1150 - lerp(1150, 1060, prog(t, 5.2, 6.4))) / 95, 5.2, 6.4, { surface: 'grass', vel: 0.5, pan: (t) => (lerp(1150, 1060, prog(t, 5.2, 6.4)) - 1130) / 420 }),
      { t: 3.0, kind: 'sfx', name: 'crash' }, { t: 3.0, kind: 'hit', name: 'crash' }, { t: 7.2, kind: 'hit', name: 'release' }, { t: 7.3, kind: 'sfx', name: 'whoosh' }, { t: 7.22, kind: 'sfx', name: 'string_taut' }, { t: 7.8, kind: 'sfx', name: 'flutter_bed', dur: 4.6, amp: 0.8 }],
    render(ctx, t, R) {
      const cz = track([[0, [1130, 656, 2.35]], [7.0, [1120, 648, 2.35]], [11.5, [1010, 560, 1.85]]], t);
      const cam = new Camera(cz[0], cz[1], cz[2]).withShake(t, 1.0, 0.3, 9);
      drawMaster(ctx, t + (o.tOff ?? 60), R, {
        cam, season: 'spring', wind: 0.6, petals: 14, petalSize: 2.6, petalRegion: [700, 300, 1500, 820],
        actors: (c) => {
          stool(c);
          // ---- 放风筝的孩子 ----
          let fx, ffacing, fpose;
          if (t < 3.4) {
            fx = lerp(1060, 1320, prog(t, 0.5, 3.4, 'inOutSine'));
            ffacing = 1;
            const ph = Math.max(0, (fx - 1060)) / 42;
            fpose = t < 0.5 ? { ...POSE.holdReel, expr: 'joy' } : { ...run(ph, { stride: 0.62 }), head: -0.05, armF: [0.9, 0.5], expr: 'joy' };
            // 风筝栽下去：刹住脚、身子往后一仰
            const brake = prog(t, 2.95, 3.38, 'outQuad');
            if (brake > 0) fpose = { ...mixv(fpose, { ...POSE.stand, lean: -0.14, head: -0.05, armF: [0.6, 0.5], armB: [-0.3, 0.3] }, brake), expr: 'surprised' };
          } else if (t < 5.0) {
            fx = 1320; ffacing = -1;
            // 回头看：先愣住，再垂头丧气
            fpose = track([[3.4, { ...POSE.stand, head: 0.05, lean: -0.04, armF: [0.5, 0.5], expr: 'surprised' }], [3.75, { ...POSE.stand, head: 0.05, expr: 'surprised' }], [4.3, { ...POSE.stand, head: 0.3, lean: 0.12, armF: [0.15, 0.25], armB: [0.05, 0.25], shrug: -1.2, expr: 'sad' }, 'inOutSine']], t);
          } else if (t < 7.2) {
            fx = lerp(1320, 1360, prog(t, 5.0, 7.2));
            ffacing = -1;
            fpose = { ...POSE.holdReel, mouth: 'line' };
          } else {
            const pull = prog(t, 7.2, 8.4, 'outCubic');
            fx = 1360 + pull * 28;
            ffacing = -1;
            const happy = t > 9.6;
            const ph = happy ? (t - 9.6) * 1.2 : 0;
            const jumpk = happy && t < 11.2 ? Math.sin((ph % 1) * Math.PI) : 0;
            fpose = { ...mixv(POSE.holdReel, { ...POSE.holdReel, lean: -0.2, head: -0.5 }, pull), mouth: happy ? 'open' : 'line', lift: jumpk * 10, head: -0.55 };
          }
          // ---- 托风筝的大人 ----
          let hx, hpose, hfacing = -1;
          if (t < 3.2) {
            hx = 1352; hfacing = -1;
            hpose = { ...POSE.stand, head: 0.1, mouth: 'smile' };
          } else if (t < 4.6) {
            hx = lerp(1352, 1150, prog(t, 3.2, 4.6, 'inOutSine'));
            hfacing = -1;
            hpose = walk((1352 - hx) / 95, { stride: 0.38 });
          } else if (t < 5.2) {
            hx = 1150; hfacing = -1;
            hpose = mixv(POSE.stand, POSE.crouch, Math.sin(prog(t, 4.6, 5.2) * Math.PI));
          } else if (t < 6.4) {
            hx = lerp(1150, 1060, prog(t, 5.2, 6.4));
            hfacing = 1;
            hpose = { ...walk((1150 - hx) / 95, { stride: 0.34 }), armF: [-2.7, 0.2], armB: [-2.55, 0.3], head: -0.3 };
          } else if (t < 7.15) {
            hx = 1060; hfacing = 1;
            // 托举前先往下一沉（预备）
            hpose = { ...track([[6.4, POSE.holdUp], [6.75, POSE.holdUp], [7.15, LAUNCH_DIP, 'inOutSine']], t), mouth: 'smile' };
          } else {
            hx = 1060; hfacing = 1;
            const push = prog(t, 7.15, 7.6, 'outCubic');
            const thrust = { ...POSE.holdUp, armF: [-3.0, 0.0], armB: [-2.9, 0.05], lean: -0.12 };
            hpose = push < 1 ? mixv(LAUNCH_DIP, thrust, push) : mixv(thrust, POSE.holdUp, prog(t, 8.2, 9.6));
            if (t > 8.6) hpose = mixv(hpose, { ...POSE.lookUp, mouth: 'open' }, prog(t, 8.6, 9.6));
          }
          const HJ = HELPER.draw(c, { ...hpose, x: hx, y: ground(hx), facing: hfacing }, t);
          const FJ = FLYER.draw(c, { ...fpose, x: fx, y: ground(fx), facing: ffacing, wind: 0.8 }, t);
          const reel = FJ.armF.hand;
          drawReel(c, reel[0], reel[1], 6.5, 0.4);
          // ---- 风筝 ----
          let K;
          if (t < 3.4) {
            const kx = fx - 120 - Math.sin(t * 7) * 6;
            const hop = Math.max(0, Math.sin(prog(t, 1.6, 2.9) * Math.PI)) * 34;
            const crash = prog(t, 2.8, 3.2, 'inCubic');
            K = { x: kx, y: ground(kx) - 14 - hop, size: 30, rot: lerp(-1.25 + Math.sin(t * 9) * 0.25, Math.PI * 0.92, crash), sx: 0.75 };
          } else if (t < 4.95) {
            const kx = 1320 - 120 + 0;
            K = { x: kx, y: ground(kx) - 12, size: 30, rot: Math.PI * 0.92, sx: 0.75 };
          } else if (t < 7.2) {
            K = { ...KITE_HOLD(HJ), size: 36, rot: Math.sin(t * 3) * 0.05 };
          } else {
            const u = prog(t, 7.2, 12.5, 'inOutSine');
            const start = KITE_HOLD(HJ);
            const wb = kiteWobble(t, 3, prog(t, 7.4, 9));
            K = { x: lerp(start.x, 560, u) + wb.dx, y: lerp(start.y, 160, Ease.outQuad(u)) + wb.dy, size: lerp(36, 30, u), rot: wb.rot - 0.1 * (1 - u) };
          }
          drawKite(c, { ...K, lineW: 0.8, patch: o.patch || 0, aged: o.aged || 0 });
          const pts = drawString(c, reel, kiteBridle(K), { width: 0.7, t, sag: t < 3.4 ? 0.02 : t < 7.2 ? 0.14 : lerp(0.14, 0.06, prog(t, 7.2, 9)), wobble: 0.3 });
          if (o.knot) drawKnot(c, pts[t < 7.2 ? 20 : 12], 1.9);
        },
      });
    },
  };
}
export const S06 = launchShot('S06', GIRL6, GRANDPA);

// ---------------- S07 镜头顺红线上摇 ----------------
const SKY_KITE = [520, -760];
export const S07 = {
  id: 'S07',
  dur: 6,
  cues: [{ t: 0.2, kind: 'sfx', name: 'wind_up' }, { t: 0.0, kind: 'sfx', name: 'flutter_bed', dur: 6.2, amp: 0.55 }],
  render(ctx, t, R) {
    const u = prog(t, 0, 6, 'inOutSine');
    const cam = new Camera(lerp(1220, 640, u), lerp(620, -600, u), lerp(2.3, 2.6, u));
    drawMaster(ctx, t + 72, R, {
      cam, season: 'spring', wind: 0.7, clouds: 1, petals: 30, petalSize: 2.6, petalRegion: [600, -900, 1500, 800], petalWind: 90,
      actors: (c) => {
        stool(c);
        GRANDPA.draw(c, { ...POSE.lookUp, x: 1070, y: ground(1070), facing: 1, mouth: 'open' }, t);
        const FJ = GIRL6.draw(c, { ...POSE.holdReel, head: -0.6, x: 1390, y: ground(1390), facing: -1, mouth: 'open', wind: 0.9 }, t);
        drawReel(c, FJ.armF.hand[0], FJ.armF.hand[1], 6.5, 0.4);
        const wb = kiteWobble(t + 20, 3);
        const K = { x: SKY_KITE[0] + wb.dx * 2, y: SKY_KITE[1] + wb.dy * 2, size: 34, rot: wb.rot };
        drawKite(c, { ...K, lineW: 0.6 });
        drawString(c, FJ.armF.hand, kiteBridle(K), { width: 0.55, t, sag: 0.05, wobble: 1.2 });
      },
    });
  },
};

// ---------------- S08 天空：风筝与燕子并飞，片名 ----------------
export const S08 = {
  id: 'S08',
  dur: 8,
  cues: [{ t: 0.0, kind: 'sfx', name: 'flutter_bed', dur: 8.0, amp: 0.45 }, { t: 1.0, kind: 'sfx', name: 'swallows' }, { t: 2.4, kind: 'hit', name: 'title' }, { t: 5.2, kind: 'sfx', name: 'seal' }, { t: 5.2, kind: 'hit', name: 'seal' }],
  render(ctx, t, R) {
    const cam = new Camera(SKY_KITE[0] + 30 - t * 6, SKY_KITE[1] + 40 - t * 3, 3.4);
    ctx.setTransform(R.base, 0, 0, R.base, 0, 0);
    drawSky(ctx, { top: [236, 238, 240], topAlpha: 0.5 });
    drawClouds(ctx, cam, R.base, t + 80, { alpha: 1.2 });
    applyCamera(ctx, cam, 1, R.base);
    const wb = kiteWobble(t + 26, 3);
    const K = { x: SKY_KITE[0] + wb.dx * 1.5, y: SKY_KITE[1] + wb.dy * 1.5, size: 34, rot: wb.rot };
    const F = fgOf(ctx);
    drawString(F, [SKY_KITE[0] + 900, SKY_KITE[1] + 1400], kiteBridle(K), { width: 0.45, t, sag: 0.04, wobble: 1 });
    drawKite(F, { ...K, lineW: 0.5 });
    drawFlock(F, t, {
      count: 5, seed: 7, speed: 0.06, spread: 0.5, size: 7, jitter: 10, flapRate: 3.4,
      path: (u, i, h) => {
        const a = u * TAU + h * TAU;
        return [SKY_KITE[0] + Math.cos(a) * (90 + h * 70) - 20, SKY_KITE[1] + Math.sin(a) * (40 + h * 30) - 10];
      },
    });
    // 片名
    ctx.setTransform(R.base, 0, 0, R.base, 0, 0);
    // 片名：毛笔按笔顺写出“纸鸢”
    writeColumn(ctx, '纸鸢', 1520, 330, 196, 182, prog(t, 2.1, 5.0, 'linear'), { tone: 0.93, halo: 1.2 });
    seal(ctx, 1640, 720, 74, '鸢', prog(t, 5.15, 5.6));
    inkText(ctx, 'The Paper Kite', 1520, 860, { size: 42, p: prog(t, 5.8, 7.0), font: 'Cormorant', weight: 'italic 500', tone: 0.7 });
  },
};

// ---------------- S09 祖孙并坐树下 ----------------
export const S09 = {
  id: 'S09',
  dur: 6,
  render(ctx, t, R) {
    const cam = new Camera(980, 520, 1.02 - t * 0.003);
    drawMaster(ctx, t + 90, R, {
      cam, season: 'spring', wind: 0.5, smoke: 0.6, petals: 20, beams: 0.9, clouds: 0.5,
      frame: { corner: 'tl', kind: 'blossom', len: 640, dip: 0.28, blur: 14, alpha: 0.95, seed: 9 },
      actors: (c) => {
        stool(c);
        GRANDPA.draw(c, { ...POSE.sit, x: STOOL_X + 3, y: stoolY(), sit: SEAT, facing: -1, head: -0.3, armF: [0.4, 0.9] }, t);
        const gx = 1172;
        const FJ = GIRL6.draw(c, { ...POSE.sit, legF: [1.5, 0.15], legB: [1.45, 0.2], x: gx, y: ground(gx), sit: 7, facing: -1, head: -0.45, armF: [1.3, 0.6], armB: [1.1, 0.7] }, t);
        drawReel(c, FJ.armF.hand[0], FJ.armF.hand[1], 6, 0.3);
        const wb = kiteWobble(t + 33, 3, 0.5);
        const K = { x: 470 + wb.dx, y: 170 + wb.dy, size: 13, rot: wb.rot };
        drawKite(c, { ...K, lineW: 0.6 });
        drawString(c, FJ.armF.hand, kiteBridle(K), { width: 0.9, t, sag: 0.06, wobble: 0.6 });
      },
    });
  },
};
