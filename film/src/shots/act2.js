// 第二幕 · 夏秋冬：挂破、补丁、独自放飞、离家、三个春天、最后一次、雪中
import { drawMaster } from '../world/master.js';
import { Camera } from '../core/camera.js';
import { track, prog, clamp, lerp, Ease, TAU, mixv, envelope } from '../core/math.js';
import { noise1 } from '../core/noise.js';
import { rgba, inkRGB, whiteOf, blob, line, fgOf } from '../ink/brush.js';
import { GRANDPA, GIRL9, GIRL12, TEEN, WOMAN_MOURN } from '../actors/cast.js';
import { POSE, walk, run, withVel } from '../actors/rig.js';
import { drawKite, drawString, drawReel, kiteBridle, drawSwallowGlyph } from '../actors/props.js';
import { ground, STOOL_X, stoolY, SEAT, stool, pathAt, depthScale, scaled, kiteWobble, insertBg, drawBrushTool, drawArmIn, drawBus, dust, caughtKite, footsteps } from './common.js';
import { ROAD_Y } from '../world/landscape.js';
import { C } from '../world/palette.js';

const SLEEVE = [84, 86, 92];
const WINTER_POST = { sat: 0.28, tint: [0.97, 0.99, 1.03] };
const WINTER_SKY = { top: [212, 218, 226], topAlpha: 0.85, horizon: [236, 238, 240], horAlpha: 0.5 };

// 白菊
export function chrysanthemum(ctx, x, y, s, a = 1) {
  const W8 = whiteOf(ctx);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  line(ctx, [[x, y], [x + s * 0.2, y + s * 2.2]], s * 0.18, C.summerDeep, a);
  ctx.restore();
  if (W8) {
    W8.save();
    W8.globalAlpha = a;
    W8.fillStyle = '#fff';
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * TAU;
      W8.beginPath();
      W8.ellipse(x + Math.cos(ang) * s * 0.55, y + Math.sin(ang) * s * 0.55, s * 0.5, s * 0.16, ang, 0, TAU);
      W8.fill();
    }
    W8.restore();
  }
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = rgba(inkRGB(0.4), 0.5 * a);
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.arc(x, y, s * 0.95, 0, TAU);
  ctx.stroke();
  blob(ctx, x, y, s * 0.22, { fill: rgba([214, 196, 120], 0.8 * a), seed: 3 });
  ctx.restore();
}

// 挂在树上的旧风筝（落雪 / 褪色）
export function caughtKiteDraw(c, t, o = {}) {
  const p = caughtKite();
  const K = { x: p[0] + 4, y: p[1] + 12 + Math.sin(t * 1.3) * 1.2, size: 22, rot: 0.55 + Math.sin(t * 0.9) * 0.04 };
  drawKite(c, { ...K, lineW: 0.6, aged: o.aged ?? 0.4, patch: 1, alpha: o.alpha ?? 1 });
  if (o.snow) {
    const W8 = whiteOf(c);
    if (W8) {
      W8.save();
      W8.globalAlpha = o.snow;
      W8.fillStyle = '#fff';
      W8.beginPath();
      W8.ellipse(K.x - 6, K.y - 10, 18, 6, 0.55, 0, TAU);
      W8.ellipse(K.x + 6, K.y - 2, 12, 5, 0.55, 0, TAU);
      W8.fill();
      W8.restore();
    }
  }
  if (o.thread) {
    const kb = kiteBridle(K);
    drawString(c, kb, [kb[0] - 6 + Math.sin(t * 1.7) * 5, kb[1] + o.thread], { width: o.threadW ?? 0.7, t, sag: 0.05, wobble: 1.2 });
  }
  return K;
}

// ---------------- S10 夏 · 黄昏：风筝被树枝挂破 ----------------
export const S10 = {
  id: 'S10',
  dur: 8,
  amb: 'summer',
  post: { tint: [1.03, 0.99, 0.93], fgTint: [1.03, 0.98, 0.93] },
  cues: [{ t: 3.1, kind: 'sfx', name: 'gust' }, { t: 4.9, kind: 'sfx', name: 'tear' }, { t: 4.9, kind: 'hit', name: 'snag' },
    ...footsteps((t) => (1010 - lerp(1010, 960, prog(t, 5.8, 7.4, 'inOutSine'))) / 34, 5.8, 7.4, { offset: 0.06, vel: 0.5, pan: () => -0.1 })],
  render(ctx, t, R) {
    const cam = new Camera(lerp(880, 930, prog(t, 0, 8)), lerp(470, 520, prog(t, 0, 8)), lerp(1.45, 1.6, prog(t, 0, 8)));
    drawMaster(ctx, t + 110, R, {
      cam, season: 'summer', wind: 0.75, smoke: 0.5,
      sky: { horizon: C.sunset, horAlpha: 0.5, sun: [430, 575, 40], sunColor: [226, 150, 112], sunAlpha: 0.8 },
      actors: (c) => {
        stool(c);
        let gx = 1010;
        let gp = { ...POSE.holdReel, head: -0.5, mouth: 'open' };
        if (t > 5.0) {
          gx = lerp(1010, 960, prog(t, 5.8, 7.4, 'inOutSine'));
          gp = t < 5.8 ? { ...POSE.stand, mouth: 'open', head: -0.2 } : { ...run((1010 - gx) / 34), mouth: 'open' };
        }
        const hx = lerp(1120, 1085, prog(t, 6.0, 8));
        const hp = t < 6.0 ? { ...POSE.lookUp, mouth: 'smile' } : walk((1120 - hx) / 90, { stride: 0.3 });
        const RIM = { dir: [-0.95, -0.1], col: [255, 196, 140], a: 0.7, w: 1.5 };
        GRANDPA.draw(c, { ...hp, x: hx, y: ground(hx), facing: -1, rim: RIM }, t);
        const FJ = GIRL9.draw(c, { ...gp, x: gx, y: ground(gx), facing: -1, wind: 0.8, rim: RIM }, t);
        drawReel(c, FJ.armF.hand[0], FJ.armF.hand[1], 6, 0.4);
        let K;
        const wb = kiteWobble(t + 5, 4);
        if (t < 3.1) K = { x: 560 + wb.dx, y: 300 + wb.dy, size: 20, rot: wb.rot };
        else if (t < 4.9) {
          const u = prog(t, 3.1, 4.9, 'inQuad');
          K = { x: lerp(560 + wb.dx, 975, u), y: lerp(300 + wb.dy, 488, u) + Math.sin(u * Math.PI) * -30, size: 20, rot: lerp(wb.rot, 2.4, u) };
        } else if (t < 5.6) {
          K = { x: 975 + Math.sin(t * 30) * 2 * (1 - prog(t, 4.9, 5.6)), y: 488, size: 20, rot: 2.4 };
        } else {
          const u = prog(t, 5.6, 6.4, 'inQuad');
          K = { x: lerp(975, 940, u), y: lerp(488, ground(940) - 10, u), size: 20, rot: lerp(2.4, 3.0, u) };
        }
        drawKite(c, { ...K, lineW: 0.7, torn: t > 4.9 ? 1 : 0 });
        drawString(c, FJ.armF.hand, kiteBridle(K), { width: 0.8, t, sag: t < 4.9 ? 0.06 : 0.25, wobble: 0.6 });
      },
    });
  },
};

// ---------------- S11 特写：补风筝，补丁上画一只小燕子 ----------------
export const S11 = {
  id: 'S11',
  dur: 6,
  post: { vig: 0.85, wobble: 0.8, tint: [1.03, 0.99, 0.94] },
  cues: [{ t: 1.0, kind: 'sfx', name: 'paper' }, { t: 2.9, kind: 'sfx', name: 'brush' }, { t: 4.2, kind: 'hit', name: 'swallow_mark' }],
  render(ctx, t, R) {
    insertBg(ctx, { base: R.base, edge: [218, 196, 168] });
    ctx.setTransform(R.base, 0, 0, R.base, 0, 0);
    const K = { x: 960 + 0.53 * 900, y: 560 + 0.21 * 900, size: 900, rot: 0 };
    const patch = prog(t, 0.9, 2.0, 'outCubic');
    drawKite(ctx, { ...K, paint: 1, torn: patch < 0.97 ? 1 : 0, patch, patchPaint: prog(t, 2.9, 4.8, 'inOutSine'), lineW: 6 });
    // 按补丁的手
    const press = prog(t, 0.6, 1.2, 'outCubic') * (1 - prog(t, 2.2, 2.8, 'inCubic'));
    if (press > 0) {
      const hand = [lerp(1500, 1010, press), lerp(1150, 610, press)];
      drawArmIn(fgOf(ctx), [hand[0] + 300, hand[1] + 260], hand, 120, SLEEVE, 1, { curl: 0.12, thumb: 0.15 });
    }
    // 毛笔画小燕子
    const brush = prog(t, 2.5, 3.0, 'outCubic') * (1 - prog(t, 5.0, 5.6, 'inCubic'));
    if (brush > 0) {
      const u = prog(t, 2.9, 4.8);
      const tip = [960 + Math.sin(u * TAU * 1.5) * 70, 545 + Math.cos(u * TAU * 3) * 18 - u * 10];
      const tp = [lerp(1700, tip[0], brush), lerp(0, tip[1], brush)];
      drawBrushTool(fgOf(ctx), tp, -0.95, 380);
      const hand = [tp[0] + Math.cos(-0.95) * 290, tp[1] + Math.sin(-0.95) * 290];
      drawArmIn(fgOf(ctx), [hand[0] + 300, hand[1] - 240], hand, 110, SLEEVE);
    }
  },
};

// ---------------- S12 秋：小燕自己把风筝放上天 ----------------
export const S12 = {
  id: 'S12',
  dur: 10,
  amb: 'autumn',
  post: { tint: [1.03, 0.99, 0.94] },
  cues: [...footsteps((t) => (lerp(890, 1120, prog(t, 0.4, 3.4, 'inOutSine')) - 890) / 40, 0.4, 3.35, { offset: 0.06, vel: 0.5, pan: (t) => (lerp(890, 1120, prog(t, 0.4, 3.4, 'inOutSine')) - 1030) / 700 }),
    { t: 2.2, kind: 'sfx', name: 'whoosh' }, { t: 3.0, kind: 'sfx', name: 'flutter_bed', dur: 7.0, amp: 0.45 }, { t: 6.5, kind: 'hit', name: 'proud' }],
  render(ctx, t, R) {
    const cam = new Camera(1030, 535, 1.12);
    drawMaster(ctx, t + 130, R, {
      cam, season: 'autumn', fallingLeaves: 26, wind: 0.8, smoke: 0.4,
      actors: (c) => {
        stool(c);
        GRANDPA.draw(c, { ...POSE.sitOld, x: STOOL_X + 3, y: stoolY(), sit: SEAT, facing: -1, head: lerp(-0.1, -0.45, prog(t, 2, 6)), mouth: 'smile' }, t);
        let gx, gp, gf;
        if (t < 3.4) {
          gx = lerp(890, 1120, prog(t, 0.4, 3.4, 'inOutSine'));
          gf = 1;
          gp = t < 0.4 ? POSE.holdReel : { ...run((gx - 890) / 40, { stride: 0.6 }), armF: [0.9, 0.5] };
        } else {
          gx = 1120; gf = -1;
          gp = { ...POSE.holdReel, head: -0.55, mouth: t > 6 ? 'open' : 'smile' };
        }
        const FJ = GIRL12.draw(c, { ...gp, x: gx, y: ground(gx), facing: gf, wind: 0.9, rim: { dir: [-0.8, -0.5], col: [255, 214, 160], a: 0.5, w: 1.2 } }, t);
        drawReel(c, FJ.armF.hand[0], FJ.armF.hand[1], 6.5, 0.4);
        const u = prog(t, 1.2, 8, 'inOutSine');
        const wb = kiteWobble(t + 9, 5, prog(t, 3, 6));
        const K = { x: lerp(gx - 140, 520, u) + wb.dx, y: lerp(ground(gx - 140) - 14, 240, Ease.outQuad(u)) + wb.dy, size: lerp(24, 20, u), rot: lerp(-1.1, 0, prog(t, 1.2, 3)) + wb.rot };
        drawKite(c, { ...K, lineW: 0.7, patch: 1 });
        drawString(c, FJ.armF.hand, kiteBridle(K), { width: 0.8, t, sag: 0.06, wobble: 0.5 });
      },
    });
  },
};

// ---------------- S13 离家：小燕下山，回头挥手，汽车远去 ----------------
// 剪辑：S13（0–10.6）→ 特写 S13B → S13C（爷爷的手已放下，汽车远去）
function renderS13(ctx, t, R, after = false) {
  const u = prog(t, 0, 14, 'inOutSine');
  const cam = new Camera(lerp(950, 990, u), lerp(588, 580, u), lerp(1.0, 1.04, u));
  drawMaster(ctx, t + 150, R, {
    cam, season: 'summer', wind: 0.35, smoke: 0.8, sky: { horizon: [250, 236, 216], horAlpha: 0.45 }, beams: 0.35, beamOpts: { alpha: 0.1 },
    actors: (c) => {
      stool(c);
      // 汽车（特写之后时间往前多走一些）
      const tb = after ? t + 1.8 : t;
      const bx = tb < 9.8 ? 640 : lerp(640, -260, prog(tb, 9.8, 13.6, 'inQuad'));
      const by = ROAD_Y(bx) + 10;
      if (tb > 9.9) dust(c, bx + 50, by - 4, tb, 1 - prog(tb, 12.5, 14));
      drawBus(c, bx, by, 1.6, 1, tb);
      // 爷爷：夹着风筝站在坡顶。她回头挥手时也挥；车开时再挥（接特写）；特写之后手已放下
      let gp;
      if (after) gp = { ...POSE.stand, armF: [0.12, 0.34], lean: 0.13, head: 0.13, smile: -0.12, tilt: -0.32 };
      else {
        const w = Math.max(envelope(t, 5.3, 6.45, 0.4, 0.45), envelope(t, 10.25, 12, 0.45, 0.3));
        const osc = Math.sin(t * 8.5) * 0.24;
        const k = Ease.inOutSine(w);
        gp = { ...POSE.stand, armF: [lerp(0.12, -2.45 + osc, k), lerp(0.32, -0.3, k)], lean: 0.04, head: -0.02, smile: t < 7 ? 0.9 : t < 9.9 ? lerp(0.9, 0.5, prog(t, 7, 9.4)) : 0.9 };
      }
      const GJ = GRANDPA.draw(c, { ...gp, armB: [0.25, 0.9], x: 1168, y: ground(1168), facing: -1 }, t);
      drawKite(c, { x: GJ.armB.hand[0] + 4, y: GJ.armB.hand[1] - 2, size: 17, rot: -1.2, sx: 0.55, lineW: 0.6, patch: 1 });
      if (after) return;
      // 小燕下山：走 → 回头挥手 → 再走、上车
      const pf = (tt) => {
        let s, facing = -1, pose;
        if (tt < 4.8) {
          s = lerp(0.05, 0.42, prog(tt, 1.0, 4.8));
          pose = walk((s - 0.05) * 900 / 92, { stride: 0.38 });
        } else if (tt < 6.8) {
          s = 0.42; facing = 1;
          const w = envelope(tt, 5.15, 6.35, 0.35, 0.4);
          const k = Ease.inOutSine(w);
          pose = { ...POSE.stand, armF: [lerp(0.1, -2.5 + Math.sin(tt * 9) * 0.25, k), lerp(0.3, -0.3, k)], expr: 'happy', head: -0.1 };
        } else {
          s = lerp(0.42, 0.93, prog(tt, 6.9, 9.3));
          pose = walk((s - 0.05) * 900 / 92, { stride: 0.38 });
        }
        const pos = pathAt(s);
        return { ...pose, x: pos[0], y: pos[1], facing };
      };
      const P = withVel(pf, t);
      const vis = 1 - prog(t, 9.0, 9.4);
      if (vis > 0) scaled(c, P.x, P.y, depthScale(P.y), () => TEEN.draw(c, { ...P, alpha: vis }, t));
    },
  });
}
export const S13 = {
  id: 'S13',
  dur: 14,
  amb: 'morning',
  cues: [
    ...footsteps((t) => (lerp(0.05, 0.42, prog(t, 1.0, 4.8)) - 0.05) * 900 / 92, 1.0, 4.8, { vel: 0.45, pan: (t) => (pathAt(lerp(0.05, 0.42, prog(t, 1.0, 4.8)))[0] - 970) / 900 }),
    ...footsteps((t) => (lerp(0.42, 0.93, prog(t, 6.9, 9.3)) - 0.05) * 900 / 92, 6.9, 9.0, { vel: 0.4, pan: (t) => (pathAt(lerp(0.42, 0.93, prog(t, 6.9, 9.3)))[0] - 970) / 900 }),
    { t: 5.0, kind: 'hit', name: 'wave' }, { t: 9.0, kind: 'sfx', name: 'bus_door' }, { t: 9.8, kind: 'sfx', name: 'bus' }],
  render(ctx, t, R) { renderS13(ctx, t, R, false); },
};
export const S13C = {
  id: 'S13C',
  dur: 3.4,
  amb: 'morning',
  cues: [{ t: 0.2, kind: 'sfx', name: 'bus_far' }],
  render(ctx, t, R) { renderS13(ctx, t + 10.6, R, true); },
};

// ---------------- S14 三个春天：爷爷独自放风筝 ----------------
function lonelySpring(id, v) {
  return {
    id,
    dur: 5.34,
    amb: 'spring',
    cues: v === 0 ? [{ t: 0.3, kind: 'sfx', name: 'birds' }] : [],
    render(ctx, t, R) {
      const cam = new Camera(1000 + v * 8, 532, 1.1 + v * 0.03);
      drawMaster(ctx, t + 170 + v * 17, R, {
        cam, season: 'spring', petals: 14, wind: 0.5, smoke: 0.5 - v * 0.2, beams: 0.5,
        actors: (c) => {
          stool(c);
          const kp = [[560, 250], [640, 330], [730, 430]][v];
          const look = prog(t, 2.2, 3.6, 'inOutSine');
          let J;
          if (v === 0) {
            J = GRANDPA.draw(c, { ...POSE.holdReel, lean: 0.12, head: lerp(-0.5, 0.15, look), x: 1110, y: ground(1110), facing: -1, mouth: 'line' }, t);
          } else if (v === 1) {
            J = GRANDPA.draw(c, { ...POSE.standOld, armF: [0.9, 0.5], armB: [0.35, 0.3], head: lerp(-0.45, 0.2, look), x: 1130, y: ground(1130), facing: -1, mouth: 'line' }, t);
            const hb = J.armB.hand;
            c.save();
            c.globalCompositeOperation = 'source-over';
            line(c, [[hb[0], hb[1] - 3], [hb[0] - 9, ground(1130 - 9) + 1]], 2.2, C.wood, 1);
            c.restore();
          } else {
            J = GRANDPA.draw(c, { ...POSE.sitOld, armF: [0.95, 0.45], armB: [0.8, 0.55], head: lerp(-0.4, 0.25, look), x: STOOL_X + 3, y: stoolY(), sit: SEAT, facing: -1, mouth: 'line' }, t);
          }
          drawReel(c, J.armF.hand[0], J.armF.hand[1], 6.5, 0.4);
          const wb = kiteWobble(t + v * 13, 6 + v, 0.8);
          const K = { x: kp[0] + wb.dx, y: kp[1] + wb.dy, size: 20 - v * 1.5, rot: wb.rot };
          drawKite(c, { ...K, lineW: 0.7, patch: 1 });
          drawString(c, J.armF.hand, kiteBridle(K), { width: 0.8, t, sag: 0.07 + v * 0.03, wobble: 0.5 });
        },
      });
    },
  };
}
export const S14A = lonelySpring('S14A', 0);
export const S14B = lonelySpring('S14B', 1);
export const S14C = lonelySpring('S14C', 2);

// ---------------- S15 冬 · 最后一次：线断了 ----------------
const SNAP = 8.6;
export const S15 = {
  id: 'S15',
  dur: 14,
  amb: 'winter_wind',
  post: WINTER_POST,
  cues: [{ t: 0.0, kind: 'sfx', name: 'flutter_bed', dur: 8.4, amp: 0.5 }, { t: 3.4, kind: 'hit', name: 'doze' }, { t: 7.4, kind: 'sfx', name: 'gust_big' }],  // 断线的声音在慢镜头特写 S15B 里
  render(ctx, t, R) {
    const u = prog(t, 0, 14, 'inOutSine');
    const cam = new Camera(lerp(1100, 1150, u), lerp(530, 590, prog(t, 9, 14, 'inOutSine')), lerp(1.85, 2.3, u));
    const gust = prog(t, 7.2, 8.3) * (1 - prog(t, 9.6, 12));
    drawMaster(ctx, t + 200, R, {
      cam, season: 'winter', wind: 0.6 + gust * 1.8, snowfall: Math.round(170 + gust * 120), snowWind: 20 + gust * 70,
      sky: WINTER_SKY, frame: { corner: 'tl', kind: 'snow', len: 500, dip: 0.3, blur: 12, alpha: 0.9, seed: 5 },
      actors: (c) => {
        stool(c, 0.3);
        // 打盹：头慢慢垂下 → 猛地一点醒 → 又慢慢睡过去
        const doze = track([[0, 0], [2.4, 0], [3.35, 0.55, 'inOutSine'], [3.5, 0.16, 'outQuad'], [3.95, 0.2], [6.0, 1.0, 'inOutSine']], t);
        const pose = mixv({ ...POSE.sitOld, armF: [0.95, 0.5], armB: [0.8, 0.6], head: -0.4 }, POSE.doze, doze);
        const woke = t > 3.45 && t < 3.95;
        const J = GRANDPA.draw(c, { ...pose, x: STOOL_X + 3, y: stoolY(), sit: SEAT, facing: -1, eyesClosed: doze > 0.42 && !woke, smile: lerp(0.3, 0.1, doze), snowCap: 0.3 + prog(t, 0, 14) * 0.6 }, t);
        const reel = [J.armF.hand[0], J.armF.hand[1] + doze * 4];
        drawReel(c, reel[0], reel[1], 6.5, 0.5 + doze * 0.6);
        const wb = kiteWobble(t + 40, 8, 1.4 + gust * 2.5);
        let K;
        const fly = { x: 945 + wb.dx, y: 300 + wb.dy - gust * 40, size: 22, rot: wb.rot };
        if (t < SNAP) K = fly;
        else {
          const target = caughtKite();
          const k = prog(t, SNAP, SNAP + 2.2, 'inOutSine');
          const snapPos = { x: 945 + kiteWobble(SNAP + 40, 8, 2.5).dx, y: 260 };
          K = { x: lerp(snapPos.x, target[0] + 4, k) + Math.sin(t * 8) * 12 * (1 - k), y: lerp(snapPos.y, target[1] + 12, Ease.inOutQuad(k)) - Math.sin(k * Math.PI) * 60, size: 22, rot: lerp(0, 0.55 + TAU, k) };
        }
        drawKite(c, { ...K, lineW: 0.7, patch: 1 });
        if (t < SNAP) {
          drawString(c, reel, kiteBridle(K), { width: 0.8, t, sag: 0.04 - gust * 0.03, wobble: 0.4 + gust * 2 });
        } else {
          drawString(c, reel, [reel[0] - 26 - Math.sin(t * 7) * 6, reel[1] + 14], { width: 0.8, t, sag: 0.3, wobble: 1.5 });
          const kb = kiteBridle(K);
          drawString(c, kb, [kb[0] - 10 + Math.sin(t * 3) * 6, kb[1] + 46], { width: 0.7, t, sag: 0.1, wobble: 1.5 });
        }
      },
    });
  },
};

// ---------------- S16 雪：空凳，捡起线拐子 ----------------
export const S16 = {
  id: 'S16',
  dur: 16,
  amb: 'winter',
  post: { ...WINTER_POST, dof: 0.3, dofRadius: 3 },
  cues: [
    ...footsteps((t) => (0.38 - lerp(0.38, 0.02, prog(t, 0.3, 6.4))) * 900 / 84, 0.3, 6.4, { surface: 'snow', vel: 0.55, pan: (t) => (pathAt(lerp(0.38, 0.02, prog(t, 0.3, 6.4)))[0] - 1100) / 700 }),
    { t: 8.6, kind: 'hit', name: 'pickup' }, { t: 12.0, kind: 'hit', name: 'tilt' }],
  render(ctx, t, R) {
    const u = prog(t, 11.5, 16, 'inOutSine');
    const cam = new Camera(lerp(1130, 1066, u), lerp(612, 572, u), lerp(2.15, 3.2, u));
    drawMaster(ctx, t + 230, R, {
      cam, season: 'winter', wind: 0.4, snowfall: 110, snowWind: 10, sky: WINTER_SKY,
      frame: { corner: 'tr', kind: 'snow', len: 520, dip: 0.3, blur: 12, alpha: 0.9, seed: 8 },
      actors: (c) => {
        stool(c, 1);
        // 剪辑：S16（0–8.3）→ 特写 S16B 拾起线拐子 → S16C（9.2 起）
        const holding = t > 9.0;
        const pf = (tt) => {
          let x, y, pose;
          if (tt < 6.4) {
            // 慢慢走上山，低着头
            const sp = lerp(0.38, 0.02, prog(tt, 0.3, 6.4));
            [x, y] = pathAt(sp);
            pose = { ...walk((0.38 - sp) * 900 / 84, { stride: 0.28, lean: 0.1 }), head: 0.25, expr: 'neutral', smile: -0.05, armF: [0.55, 0.9] };
          } else {
            x = lerp(1186, 1180, prog(tt, 6.4, 7.0));
            y = ground(x);
            const CROUCH = { ...POSE.crouch, armF: [1.05, 0.25], armB: [0.7, 0.5], head: 0.45, eyesDown: true };
            if (tt < 9.2) pose = track([[6.4, { ...POSE.stand, head: 0.3, armF: [0.55, 0.9] }], [7.0, { ...POSE.stand, head: 0.32, armF: [0.55, 0.9] }], [7.85, { ...CROUCH, armF: [1.2, 0.2] }, 'inOutSine'], [8.3, CROUCH]], tt);
            else pose = track([[9.2, { ...POSE.crouch, ...POSE.hug, legF: POSE.crouch.legF, legB: POSE.crouch.legB, head: 0.4 }], [10.3, { ...POSE.hug, head: 0.38 }, 'inOutSine'], [11.6, { ...POSE.hug, head: 0.36 }], [13.2, { ...POSE.hug, head: -0.4, eyesUp: true }, 'inOutSine']], tt);
            pose = { ...pose, expr: 'neutral', smile: -0.08, tilt: -0.2 };
          }
          return { ...pose, x, y, facing: 1 };
        };
        const P = withVel(pf, t);
        const J = WOMAN_MOURN.draw(c, P, t);
        // 白菊：先在手里，放下后留在凳上
        if (t < 7.75) chrysanthemum(c, J.armF.hand[0] + 2, J.armF.hand[1] - 6, 4.2);
        else chrysanthemum(c, STOOL_X - 6, stoolY() - SEAT - 3, 4.2);
        // 线拐子
        if (!holding) {
          drawReel(c, STOOL_X + 6, stoolY() - SEAT - 3, 6.5, 1.45);
          drawString(c, [STOOL_X + 9, stoolY() - SEAT - 3], [STOOL_X + 30, stoolY() - SEAT + 6], { width: 0.8, t, sag: 0.2, wobble: 0.8 });
        } else {
          const h = [(J.armF.hand[0] + J.armB.hand[0]) / 2, (J.armF.hand[1] + J.armB.hand[1]) / 2];
          drawReel(c, h[0], h[1], 6.5, 0.2);
          drawString(c, h, [h[0] + 6 + Math.sin(t * 2) * 3, h[1] + 22], { width: 0.8, t, sag: 0.1, wobble: 0.8 });
        }
        caughtKiteDraw(c, t, { aged: 0.3, snow: 1, thread: 34 });
      },
    });
  },
};
