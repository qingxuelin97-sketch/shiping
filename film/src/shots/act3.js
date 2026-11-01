// 第三幕 · 春又来：雪化梨花、发现旧风筝、闪回、结、重描、再飞、身影、终景
import { drawMaster, TREE } from '../world/master.js';
import { Camera, applyCamera } from '../core/camera.js';
import { drawSky } from '../world/landscape.js';
import { drawClouds } from '../world/sky.js';
import { track, prog, clamp, lerp, Ease, TAU, mixv, envelope } from '../core/math.js';
import { noise1, hash } from '../core/noise.js';
import { rgba, inkRGB, whiteOf, softDot, fgOf } from '../ink/brush.js';
import { GRANDPA, GIRL6, WOMAN, DAUGHTER } from '../actors/cast.js';
import { POSE, walk, run } from '../actors/rig.js';
import { drawKite, drawString, drawReel, drawKnot, kiteBridle, kitePaintTip, drawFlock } from '../actors/props.js';
import { drawPetals } from '../world/particles.js';
import { ground, STOOL_X, stoolY, SEAT, stool, pathAt, depthScale, scaled, kiteWobble, insertBg, drawBrushTool, drawArmIn, caughtKite } from './common.js';
import { caughtKiteDraw } from './act2.js';
import { S05, launchShot, bigHead } from './act1.js';
import { C } from '../world/palette.js';

const W_SLEEVE = [176, 190, 182];
const WINTER_POST = { sat: 0.28, tint: [0.97, 0.99, 1.03] };

// ---------------- S17 枝头积雪化作满树梨花 ----------------
export const S17 = {
  id: 'S17',
  dur: 8,
  amb: 'thaw',
  post: (t) => mixv(WINTER_POST, { sat: 1, tint: [1, 1, 1] }, prog(t, 1.0, 6.0, 'inOutSine')),
  cues: [{ t: 1.0, kind: 'hit', name: 'bloom' }, { t: 4.6, kind: 'sfx', name: 'birds' }],
  render(ctx, t, R) {
    const u = prog(t, 0, 8, 'inOutSine');
    const cam = new Camera(lerp(1066, 1110, u), lerp(572, 520, u), lerp(3.2, 1.75, u));
    const melt = prog(t, 0.5, 5.2, 'inOutSine');
    drawMaster(ctx, t + 260, R, {
      cam, season: 'spring', snow: 1 - melt, bloom: 1, bloomWave: prog(t, 0.8, 6.8), leaves: 0, wind: 0.4, beams: melt * 0.9,
      sky: { top: [lerp(212, 240, melt), lerp(218, 240, melt), lerp(226, 238, melt)], topAlpha: lerp(0.85, 0.6, melt) },
      petals: Math.round(prog(t, 5.5, 8) * 16),
      snowfall: Math.round((1 - prog(t, 0, 2.5)) * 60),
      actors: (c) => {
        stool(c, 1 - melt);
        caughtKiteDraw(c, t, { aged: lerp(0.3, 0.6, melt), snow: 1 - melt, thread: 34 });
      },
    });
  },
};

// ---------------- S18 多年后：母女上山 ----------------
export const S18 = {
  id: 'S18',
  dur: 8,
  amb: 'spring',
  cues: [{ t: 0.4, kind: 'sfx', name: 'swallows' }, { t: 1.6, kind: 'sfx', name: 'child_run' }],
  render(ctx, t, R) {
    const u = prog(t, 0, 8, 'inOutSine');
    const cam = new Camera(lerp(960, 1000, u), lerp(540, 548, u), lerp(1.0, 1.06, u));
    drawMaster(ctx, t + 300, R, {
      cam, season: 'spring', smoke: 0, petals: 18, wind: 0.5, beams: 0.6,
      actors: (c) => {
        stool(c);
        caughtKiteDraw(c, t, { aged: 0.6, thread: 34 });
        const walker = (fig, s, pose) => {
          const pos = pathAt(s);
          scaled(c, pos[0], pos[1], depthScale(pos[1]), () => fig.draw(c, { ...pose, x: pos[0], y: pos[1], facing: 1 }, t));
          return pos;
        };
        const sm = lerp(0.9, 0.5, prog(t, 0, 8));
        walker(WOMAN, sm, { ...walk((0.9 - sm) * 900 / 95, { stride: 0.36 }), mouth: 'smile' });
        const sd = t < 1.4 ? lerp(0.86, 0.8, t / 1.4) : lerp(0.8, 0.06, prog(t, 1.4, 7.4, 'inOutSine'));
        const dpose = t < 1.4 ? walk((0.86 - sd) * 900 / 60) : t < 7.4 ? { ...run((0.86 - sd) * 900 / 40, { stride: 0.6 }), mouth: 'open' } : { ...POSE.lookUp, mouth: 'open' };
        walker(DAUGHTER, sd, { ...dpose, wind: 0.8 });
      },
      front: (c) => {
        drawFlock(c, t, { count: 3, seed: 13, speed: 0.11, spread: 0.06, size: 9, jitter: 14, path: (u, i) => [lerp(2050, -200, u), 280 + Math.sin(u * 6 + i * 1.5) * 70 + i * 20] });
      },
    });
  },
};

// ---------------- S19 女儿发现树上的旧风筝 ----------------
export const S19 = {
  id: 'S19',
  dur: 8,
  amb: 'spring',
  post: (t) => ({ dof: lerp(0.45, 0.9, prog(t, 3, 7.4)), dofRadius: lerp(3.5, 6, prog(t, 3, 7.4)) }),
  cues: [{ t: 1.5, kind: 'hit', name: 'point' }, { t: 5.6, kind: 'hit', name: 'patch' }],
  render(ctx, t, R) {
    let cam;
    const kp = { x: 1070, y: 586 };
    const patchW = [kp.x - 0.53 * 22 * Math.cos(0.55) + 0.21 * 22 * Math.sin(0.55), kp.y - 0.53 * 22 * Math.sin(0.55) - 0.21 * 22 * Math.cos(0.55)];
    if (t < 3) cam = new Camera(1110, 640, 2.7);
    else {
      const u = prog(t, 3, 7.4, 'inOutSine');
      cam = new Camera(lerp(1110, patchW[0], u), lerp(640, patchW[1], u), lerp(2.7, 8.5, Ease.inOutQuad(u)));
    }
    drawMaster(ctx, t + 320, R, {
      cam, season: 'spring', petals: 12, petalSize: 2.6, wind: 0.45, petalRegion: [900, 450, 1400, 820],
      // 镜头推近时，前景花枝向画外滑走
      frame: { corner: 'tr', kind: 'blossom', len: 520, dip: 0.3, blur: 14, alpha: 0.9, seed: 3, shift: [prog(t, 3, 6.2, 'inQuad') * 520, -prog(t, 3, 6.2, 'inQuad') * 380] },
      actors: (c) => {
        stool(c);
        const K = caughtKiteDraw(c, t, { aged: 0.6, thread: 40, threadW: 0.6 });
        const dpose = t < 1.4 ? { ...POSE.lookUp, mouth: 'open' } : { ...POSE.point, armF: [-2.25 + Math.sin(t * 4) * 0.04, -0.05], mouth: 'open' };
        DAUGHTER.draw(c, { ...dpose, x: 1126, y: ground(1126), facing: -1, wind: 0.6 }, t);
        const wx = lerp(960, 1050, prog(t, 0, 2.6, 'inOutSine'));
        const wpose = t < 2.6 ? walk((wx - 960) / 95, { stride: 0.34 }) : { ...POSE.lookUp, mouth: 'line', head: -0.6 };
        const WJ = WOMAN.draw(c, { ...wpose, x: wx, y: ground(wx), facing: 1 }, t);
        drawReel(c, WJ.armB.hand[0], WJ.armB.hand[1], 6, 0.2);
      },
    });
  },
};

// ---------------- S20 认出风筝 → 闪回 ----------------
const W_POS = { x: 1050 };
function womanFace(id, dur, o = {}) {
  return {
    id,
    dur,
    amb: 'spring',
    post: { vig: 0.75, dof: 1, dofRadius: 6 },
    cues: o.cues || [],
    render(ctx, t, R) {
      const pose = { ...POSE.lookUp, head: -0.55, x: W_POS.x, y: ground(W_POS.x), facing: 1, mouth: o.mouth ? o.mouth(t) : 'line', eyesUp: true };
      const J = WOMAN.joints(pose);
      const cam = new Camera(J.head[0] + 4, J.head[1] + 10, lerp(12.5, 13.5, t / dur));
      drawMaster(ctx, t + 340, R, {
        cam, season: 'spring', petals: 10, petalSize: 2, wind: 0.4, petalRegion: [1000, 520, 1120, 700],
        actors: (c) => {
          stool(c);
          WOMAN.draw(c, pose, t);
          if (o.tear) {
            const k = prog(t, 0.3, 1.8, 'inQuad');
            const W8 = whiteOf(c);
            if (W8 && k > 0 && k < 1) {
              const r = WOMAN.L.headR;
              W8.save();
              W8.fillStyle = 'rgba(255,255,255,0.9)';
              W8.beginPath();
              W8.ellipse(J.head[0] + r * 0.45, J.head[1] + r * (0.12 + k * 0.5), r * 0.06, r * 0.09, 0, 0, TAU);
              W8.fill();
              W8.restore();
            }
          }
        },
      });
    },
  };
}
export const S20A = womanFace('S20A', 3.4, { mouth: (t) => (t > 1.8 ? 'open' : 'line'), cues: [{ t: 1.8, kind: 'hit', name: 'recognize' }] });
export const S20B = {
  id: 'S20B',
  dur: 3.2,
  amb: 'memory',
  post: { sepia: 0.85, sat: 0.35, vig: 1.05, wobble: 1.6, tint: [1.02, 0.99, 0.94] },
  cues: [{ t: 0.2, kind: 'hit', name: 'flashback' }],
  render(ctx, t, R) {
    S05.render(ctx, 4.25 + t * 0.4, R);
  },
};
export const S20C = womanFace('S20C', 2.4, { mouth: () => 'smile', tear: true });

// ---------------- S21 取下风筝；打结；重描 ----------------
export const S21A = {
  id: 'S21A',
  dur: 4.6,
  amb: 'spring',
  post: { dof: 0.45, dofRadius: 3.5 },
  cues: [{ t: 2.3, kind: 'sfx', name: 'rustle' }],
  render(ctx, t, R) {
    const cam = new Camera(1120, 610, 2.9);
    drawMaster(ctx, t + 360, R, {
      cam, season: 'spring', petals: 14, petalSize: 2.6, wind: 0.45, petalRegion: [920, 450, 1350, 800],
      frame: { corner: 'tl', kind: 'blossom', len: 560, dip: 0.3, blur: 14, alpha: 0.9, seed: 12 },
      actors: (c) => {
        stool(c);
        const took = t > 2.4;
        // 站在凳上够风筝
        let pose, x = STOOL_X - 2, y = stoolY() - SEAT + 1;
        if (t < 3.3) pose = { ...POSE.point, armF: [lerp(-2.0, -2.45, prog(t, 0.3, 2.2)), -0.1], armB: [-0.3, 0.2], head: -0.6, mouth: 'line' };
        else {
          x = lerp(STOOL_X - 2, STOOL_X - 34, prog(t, 3.3, 4.2));
          y = lerp(stoolY() - SEAT + 1, ground(STOOL_X - 34), prog(t, 3.3, 4.2, 'inQuad'));
          pose = { ...POSE.reach, armF: [0.6, 0.4], head: 0.1, mouth: 'smile' };
        }
        const J = WOMAN.draw(c, { ...pose, x, y, facing: -1 }, t);
        if (!took) caughtKiteDraw(c, t, { aged: 0.6, thread: 40, threadW: 0.6 });
        else {
          const h = J.armF.hand;
          const K = { x: h[0] - 4, y: h[1] + 16, size: 22, rot: lerp(0.55, 0.1, prog(t, 2.4, 3.6)) };
          drawKite(c, { ...K, lineW: 0.6, aged: 0.6, patch: 1 });
          const kb = kiteBridle(K);
          drawString(c, kb, [kb[0] - 4, kb[1] + 30], { width: 0.6, t, sag: 0.1, wobble: 1 });
        }
        const DJ = DAUGHTER.draw(c, { ...POSE.lookUp, armF: [0.8, 0.9], armB: [0.7, 1.0], x: 1110, y: ground(1110), facing: 1, mouth: 'open' }, t);
        drawReel(c, (DJ.armF.hand[0] + DJ.armB.hand[0]) / 2, (DJ.armF.hand[1] + DJ.armB.hand[1]) / 2, 6, 0.2);
      },
    });
  },
};

export const S21B = {
  id: 'S21B',
  dur: 3.6,
  post: { vig: 0.85, wobble: 0.8 },
  cues: [{ t: 2.0, kind: 'sfx', name: 'knot' }, { t: 2.0, kind: 'hit', name: 'knot' }],
  render(ctx, t, R) {
    insertBg(ctx, { base: R.base });
    ctx.setTransform(R.base, 0, 0, R.base, 0, 0);
    drawReel(ctx, 250, 760, 120, 0.15);
    drawKite(ctx, { x: 1880, y: 260, size: 520, rot: 0.6, aged: 0.6, patch: 1, lineW: 4 });
    const k = prog(t, 0.2, 1.9, 'inOutSine');
    const L = [lerp(760, 960, k), lerp(600, 545, k)];
    const Rr = [lerp(1160, 960, k), lerp(480, 545, k)];
    const F = fgOf(ctx);
    drawString(F, [300, 740], L, { width: 4, t, sag: 0.06, wobble: 1 });
    drawString(F, [1690, 380], Rr, { width: 4, t, sag: 0.06, wobble: 1 });
    const knot = prog(t, 1.8, 2.5, 'outBack');
    if (knot > 0) drawKnot(F, [960, 545], 14 * knot);
    const pull = prog(t, 2.5, 3.2, 'outCubic');
    drawArmIn(fgOf(ctx), [L[0] - 260 - pull * 30, L[1] + 330], [L[0] - 50 - pull * 30, L[1] + 40], 110, W_SLEEVE, 1, { curl: 0.7, thumb: 0.65, seed: 5 });
    drawArmIn(fgOf(ctx), [Rr[0] + 300 + pull * 30, Rr[1] + 360], [Rr[0] + 50 + pull * 30, Rr[1] + 40], 110, W_SLEEVE, 1, { curl: 0.7, thumb: 0.65, seed: 6 });
  },
};

const INSERT_KITE = { x: 960, y: 520, size: 360, rot: -0.04 };
export const S21C = {
  id: 'S21C',
  dur: 4.2,
  post: { vig: 0.8, wobble: 0.8 },
  cues: [{ t: 0.4, kind: 'sfx', name: 'brush' }, { t: 1.6, kind: 'hit', name: 'peek' }],
  render(ctx, t, R) {
    insertBg(ctx, { base: R.base });
    ctx.setTransform(R.base, 0, 0, R.base, 0, 0);
    drawKite(ctx, { ...INSERT_KITE, aged: 1, patch: 1, lineW: 3.2 });
    const paint = prog(t, 0.3, 4.0, 'inOutSine');
    drawKite(ctx, { ...INSERT_KITE, overpaint: true, paper: 0, frame: 0, paint, lineW: 3.2 });
    const on = prog(t, 0.0, 0.4, 'outCubic');
    const tip = kitePaintTip(INSERT_KITE, paint);
    const tp = [lerp(1750, tip[0], on), lerp(-50, tip[1] - Math.abs(Math.sin(paint * 60)) * 6, on)];
    drawBrushTool(fgOf(ctx), tp, -0.95, 300);
    const hand = [tp[0] + Math.cos(-0.95) * 230, tp[1] + Math.sin(-0.95) * 230];
    drawArmIn(fgOf(ctx), [hand[0] + 300, hand[1] - 240], hand, 74, W_SLEEVE);
    const peek = prog(t, 1.4, 2.4, 'outBack');
    if (peek > 0) {
      const hx = lerp(-180, 300, peek), hy = lerp(1200, 880, peek);
      bigHead(fgOf(ctx), DAUGHTER, hx, hy, 14, { facing: 1, head: -0.2 + Math.sin(t * 2) * 0.03, mouth: t < 3.2 ? 'open' : 'smile', eyesUp: true, wind: 0.2, armF: [0.3, 0.4] }, t);
    }
  },
};

// ---------------- S22 再飞（呼应 S06） ----------------
export const S22 = { ...launchShot('S22', DAUGHTER, WOMAN, { tOff: 380, patch: 1, aged: 0.15, knot: true }), dur: 10 };

// ---------------- S23 顺着红线上摇，线结掠过，燕群围着风筝 ----------------
const SKY_KITE = [520, -760];
export const S23 = {
  id: 'S23',
  dur: 8,
  amb: 'sky',
  cues: [{ t: 0.2, kind: 'sfx', name: 'wind_up' }, { t: 2.4, kind: 'hit', name: 'knot_pass' }, { t: 5.0, kind: 'sfx', name: 'swallows' }],
  render(ctx, t, R) {
    const u = prog(t, 0, 6.2, 'inOutSine');
    const cam = new Camera(lerp(1240, 560, u), lerp(620, -730, u), lerp(2.4, 3.0, u));
    drawMaster(ctx, t + 400, R, {
      cam, season: 'spring', wind: 0.7, clouds: 1, petals: 30, petalSize: 2.6, petalRegion: [600, -900, 1500, 800], petalWind: 90,
      actors: (c) => {
        stool(c);
        WOMAN.draw(c, { ...POSE.lookUp, x: 1070, y: ground(1070), facing: 1, mouth: 'smile' }, t);
        const FJ = DAUGHTER.draw(c, { ...POSE.holdReel, head: -0.6, x: 1390, y: ground(1390), facing: -1, mouth: 'open', wind: 0.9 }, t);
        drawReel(c, FJ.armF.hand[0], FJ.armF.hand[1], 6.5, 0.4);
        const wb = kiteWobble(t + 50, 3);
        const K = { x: SKY_KITE[0] + wb.dx * 2, y: SKY_KITE[1] + wb.dy * 2, size: 34, rot: wb.rot };
        drawKite(c, { ...K, lineW: 0.55, patch: 1, aged: 0.15 });
        const pts = drawString(c, FJ.armF.hand, kiteBridle(K), { width: 0.55, t, sag: 0.05, wobble: 1.2 });
        drawKnot(c, pts[16], 2.6);
        const fl = prog(t, 4.2, 6.5);
        if (fl > 0) {
          drawFlock(c, t, {
            count: 7, seed: 21, speed: 0.07, spread: 0.6, size: 7, jitter: 10, flapRate: 3.6, alpha: fl,
            path: (uu, i, h) => {
              const a = uu * TAU + h * TAU;
              return [K.x + Math.cos(a) * (95 + h * 80) * fl + (1 - fl) * 400, K.y + Math.sin(a) * (45 + h * 35) - 10];
            },
          });
        }
      },
    });
  },
};

// ---------------- S24 爷爷的淡墨身影 ----------------
export const S24 = {
  id: 'S24',
  dur: 6,
  amb: 'spring',
  post: { dof: 0.5, dofRadius: 3.5 },
  cues: [{ t: 0.8, kind: 'hit', name: 'ghost' }, { t: 3.5, kind: 'sfx', name: 'gust_petals' }],
  render(ctx, t, R) {
    const cam = new Camera(1080, 632, 3.0).withShake(t, 1, 0.3, 4);
    const gust = prog(t, 3.2, 4.2) * (1 - prog(t, 5.2, 6));
    drawMaster(ctx, t + 420, R, {
      cam, season: 'spring', wind: 0.5 + gust, petals: Math.round(14 + gust * 60), petalSize: 2.4, petalWind: 70 + gust * 160, petalRegion: [880, 480, 1320, 800], beams: 0.8,
      frame: { corner: 'tr', kind: 'blossom', len: 500, dip: 0.3, blur: 14, alpha: 0.9, seed: 14 },
      actors: (c) => {
        stool(c);
        const ga = envelope(t, 1.6, 3.4, 1.2, 1.6) * 0.42;
        if (ga > 0.005) {
          // 淡墨的爷爷：微笑着，轻轻抬手（像当年那样），随后在一阵花瓣里散去
          const wv = envelope(t, 2.0, 3.0, 0.5, 0.5);
          const arm = [lerp(0.15, -2.2 + Math.sin(t * 6) * 0.18, Ease.inOutSine(wv)), lerp(0.2, -0.25, wv)];
          GRANDPA.draw(c, { ...POSE.lookUp, armF: arm, head: lerp(-0.6, -0.15, prog(t, 1.4, 2.4)), lean: 0.12, x: 1150, y: ground(1150), facing: -1, smile: 0.9, alpha: ga }, t);
          if (t > 3.4) {
            drawPetals(c, t, { region: [1110, 590, 1190, 720], count: Math.round(18 * (1 - prog(t, 3.4, 5.6))), vx: -120, vy: -10, seed: 33, size: 2.2 });
          }
        }
        WOMAN.draw(c, { ...POSE.lookUp, head: -0.6, x: 1062, y: ground(1062), facing: -1, mouth: 'smile' }, t);
        const FJ = DAUGHTER.draw(c, { ...POSE.holdReel, head: -0.6, x: 996, y: ground(996), facing: -1, mouth: 'open', wind: 0.8 }, t);
        drawReel(c, FJ.armF.hand[0], FJ.armF.hand[1], 6, 0.4);
        drawString(c, FJ.armF.hand, [FJ.armF.hand[0] - 400, FJ.armF.hand[1] - 380], { width: 0.6, t, sag: 0.02, wobble: 0.8 });
      },
    });
  },
};

// ---------------- S25 终景：满树梨花、母女、风筝；墨雾漫过 ----------------
export const S25 = {
  id: 'S25',
  dur: 8,
  amb: 'spring',
  post: (t) => { const g = prog(t, 0.5, 5.5, 'inOutSine'); return { fade: prog(t, 4.2, 7.8, 'inOutSine'), tint: [1 + g * 0.05, 1 + g * 0.01, 1 - g * 0.07], fgTint: [1 + g * 0.03, 1, 1 - g * 0.04] }; },
  cues: [{ t: 4.2, kind: 'hit', name: 'fade' }],
  render(ctx, t, R) {
    const u = prog(t, 0, 8, 'inOutSine');
    const cam = new Camera(lerp(980, 900, u), lerp(530, 500, u), lerp(1.04, 0.98, u));
    drawMaster(ctx, t + 440, R, {
      cam, season: 'spring', wind: 0.55, smoke: 0.6, petals: 22, beams: 0.6 + prog(t, 0, 5) * 0.8, beamOpts: { alpha: 0.16 },
      actors: (c) => {
        stool(c);
        WOMAN.draw(c, { ...POSE.lookUp, x: 1062, y: ground(1062), facing: -1, mouth: 'smile' }, t);
        const FJ = DAUGHTER.draw(c, { ...POSE.holdReel, head: -0.6, x: 996, y: ground(996), facing: -1, mouth: 'open', wind: 0.8 }, t);
        drawReel(c, FJ.armF.hand[0], FJ.armF.hand[1], 6, 0.4);
        const wb = kiteWobble(t + 60, 3, 0.6);
        const K = { x: 430 + wb.dx, y: 150 + wb.dy, size: 13, rot: wb.rot };
        drawKite(c, { ...K, lineW: 0.6, patch: 1, aged: 0.15 });
        const pts = drawString(c, FJ.armF.hand, kiteBridle(K), { width: 0.9, t, sag: 0.06, wobble: 0.6 });
        drawKnot(c, pts[12], 1.6);
        drawFlock(c, t, {
          count: 6, seed: 25, speed: 0.07, spread: 0.6, size: 4, jitter: 6, flapRate: 3.6,
          path: (uu, i, h) => {
            const a = uu * TAU + h * TAU;
            return [K.x + Math.cos(a) * (40 + h * 30), K.y + Math.sin(a) * (16 + h * 12)];
          },
        });
      },
    });
  },
};
