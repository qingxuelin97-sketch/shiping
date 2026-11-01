// 题献与片尾字幕
import { prog, clamp, lerp, envelope } from '../core/math.js';
import { insertBg, inkText, seal } from './common.js';
import { drawKite, drawSwallowGlyph } from '../actors/props.js';
import { inkRGB } from '../ink/brush.js';

export const S26 = {
  id: 'S26',
  dur: 5,
  amb: 'none',
  post: { vig: 0.5, wobble: 0.7 },
  render(ctx, t, R) {
    ctx.setTransform(R.base, 0, 0, R.base, 0, 0);
    const a = envelope(t, 0.9, 3.9, 0.9, 1.0);
    inkText(ctx, '献给所有在等我们回家的人', 960, 500, { size: 60, p: a, font: 'ZhiMangXing', tone: 0.88 });
    inkText(ctx, 'For everyone still waiting for us to come home.', 960, 590, { size: 34, p: a * envelope(t, 1.4, 3.9, 0.8, 1.0), font: 'Cormorant', weight: 'italic 500', tone: 0.62 });
  },
};

const CARDS = [
  { t0: 0.6, t1: 4.6, kind: 'title' },
  {
    t0: 5.0, t1: 9.2,
    lines: [['故事 · 美术 · 动画 · 配乐', 'Story · Art · Animation · Music'], ['全片画面与配乐由代码逐帧生成', 'every frame and every note generated in code']],
  },
  {
    t0: 9.6, t1: 13.8,
    lines: [['音效（CC0 · OpenGameArt）', 'Sound effects (CC0, OpenGameArt)'], ['bashar3a · remaxim · thimras · isaiah658', 'syncopika · ignasd · pauliuw']],
  },
  {
    t0: 14.2, t1: 18.4,
    lines: [['音色 GeneralUser GS — S. Christian Collins', 'Instruments: GeneralUser GS'], ['字体 马善政 · 志莽行书 · 站酷小薇 · Cormorant', 'Fonts under the SIL Open Font License']],
  },
  {
    t0: 18.8, t1: 23.2,
    lines: [['题诗 清 · 高鼎《村居》', 'Poem: Gao Ding, “Village Life” (Qing dynasty)'], ['工具 Chromium · WebGL · FFmpeg · Python · Claude', 'Tools']],
  },
];

export const S27 = {
  id: 'S27',
  dur: 25,
  amb: 'none',
  post: { vig: 0.55, wobble: 0.7 },
  render(ctx, t, R) {
    insertBg(ctx, { base: R.base, edge: [228, 218, 200] });
    ctx.setTransform(R.base, 0, 0, R.base, 0, 0);
    for (const c of CARDS) {
      const a = envelope(t, c.t0 + 0.7, c.t1 - 0.6, 0.7, 0.6);
      if (a <= 0) continue;
      if (c.kind === 'title') {
        drawKite(ctx, { x: 960, y: 390, size: 70, rot: Math.sin(t * 1.2) * 0.06, lineW: 1.2, patch: 1, alpha: a });
        inkText(ctx, '纸鸢', 960, 600, { size: 96, p: a, font: 'MaShanZheng', tone: 0.9 });
        inkText(ctx, 'The Paper Kite', 960, 690, { size: 40, p: a, font: 'Cormorant', weight: 'italic 500', tone: 0.65 });
        seal(ctx, 1090, 600, 46, '鸢', a);
      } else {
        c.lines.forEach(([zh, en], i) => {
          const y = 470 + i * 150;
          inkText(ctx, zh, 960, y, { size: 44, p: a, font: 'ZCOOLXiaoWei', tone: 0.85 });
          inkText(ctx, en, 960, y + 52, { size: 30, p: a, font: 'Cormorant', weight: 'italic 500', tone: 0.6 });
        });
      }
    }
    // 结尾：一只小燕子飞过
    const u = prog(t, 23.0, 25.0, 'inOutSine');
    if (u > 0 && u < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      drawSwallowGlyph(ctx, lerp(1300, 620, u), lerp(560, 470, u) + Math.sin(u * 9) * 10, 22, inkRGB(0.9), Math.sin(t * 18) * 0.5);
      ctx.restore();
    }
  },
};

// ---------------- 海报（竖版 2:3，从 16:9 画面中央裁出） ----------------
import { drawMaster } from '../world/master.js';
import { Camera } from '../core/camera.js';
import { GRANDPA, GIRL6 } from '../actors/cast.js';
import { POSE } from '../actors/rig.js';
import { drawString, drawReel, kiteBridle, drawFlock } from '../actors/props.js';
import { ground, STOOL_X, stoolY, SEAT, stool } from './common.js';

export const POSTER = {
  id: 'POSTER',
  dur: 1,
  post: { vig: 0.75 },
  render(ctx, t, R) {
    const cam = new Camera(1160, 365, 1.0);
    drawMaster(ctx, 12, R, {
      cam, season: 'spring', wind: 0.5, petals: 26, smoke: 0,
      actors: (c) => {
        stool(c);
        GRANDPA.draw(c, { ...POSE.sit, x: STOOL_X + 3, y: stoolY(), sit: SEAT, facing: -1, head: -0.35, armF: [0.4, 0.9] }, 12);
        const FJ = GIRL6.draw(c, { ...POSE.holdReel, head: -0.6, x: 1150, y: ground(1150), facing: -1, mouth: 'open', wind: 0.8 }, 12);
        drawReel(c, FJ.armF.hand[0], FJ.armF.hand[1], 6, 0.4);
        const K = { x: 1010, y: 20, size: 26, rot: -0.12 };
        drawKite(c, { ...K, lineW: 0.8 });
        drawString(c, FJ.armF.hand, kiteBridle(K), { width: 1.0, t: 3, sag: 0.05, wobble: 0.4 });
        drawFlock(c, 2, { count: 3, seed: 5, speed: 0, spread: 1, size: 6, jitter: 0, path: (u, i) => [1060 + i * 60, -40 + i * 26] });
      },
    });
    ctx.setTransform(R.base, 0, 0, R.base, 0, 0);
    inkText(ctx, '纸鸢', 1245, 128, { vertical: true, size: 112, p: 1, font: 'MaShanZheng', tone: 0.92 });
    seal(ctx, 1245, 352, 42, '鸢', 1);
    inkText(ctx, 'The Paper Kite', 960, 940, { size: 40, p: 1, font: 'Cormorant', weight: 'italic 500', tone: 0.7 });
    inkText(ctx, '连着我们的那根线，从来没断过', 960, 1000, { size: 30, p: 1, font: 'ZhiMangXing', tone: 0.75 });
  },
};
