// 角色检查图（开发用）
//   lt 0..1  三景别对比（中景）
//   lt 1..2  走路循环 8 帧（小燕 9 岁、爷爷）
//   lt 2..3  跑步循环 8 帧（小燕 6 岁）
//   lt 3..4  表情表（特写）
//   lt 4..5  爷爷的姿势
import { drawMaster } from '../world/master.js';
import { Camera, applyCamera } from '../core/camera.js';
import { GRANDPA, GIRL6, GIRL9, GIRL12, TEEN, WOMAN_MOURN, WOMAN, DAUGHTER } from '../actors/cast.js';
import { POSE, walk, run, EXPR } from '../actors/rig.js';
import { hillY } from '../world/landscape.js';
import { drawStool } from '../actors/props.js';
import { fgOf, whiteOf, line, inkRGB } from '../ink/brush.js';
import { inkText } from './common.js';

function paperGround(ctx, y0, y1 = null) {
  ctx.save();
  line(ctx, [[60, y0], [1860, y0]], 1.2, inkRGB(0.5), 0.5);
  if (y1) line(ctx, [[60, y1], [1860, y1]], 1.2, inkRGB(0.5), 0.5);
  ctx.restore();
}

export default {
  id: 'CAST',
  dur: 5,
  render(ctx, t, R) {
    const seg = Math.floor(t);
    if (seg === 0) {
      const cam = new Camera(1150, 640, 3.2);
      drawMaster(ctx, t, R, {
        cam, season: 'spring',
        actors: (c) => {
          const xs = [1000, 1040, 1075, 1112, 1150, 1195, 1240, 1290, 1330];
          const list = [
            [GRANDPA, { ...POSE.stand, expr: 'happy' }],
            [GRANDPA, { ...POSE.standOld }],
            [GIRL6, { ...POSE.stand, expr: 'joy' }],
            [GIRL9, { ...POSE.stand, expr: 'happy' }],
            [GIRL12, { ...POSE.stand, expr: 'neutral' }],
            [TEEN, { ...POSE.wave }],
            [WOMAN_MOURN, { ...POSE.hug }],
            [WOMAN, { ...POSE.stand, expr: 'tender' }],
            [DAUGHTER, { ...POSE.stand, expr: 'laugh' }],
          ];
          list.forEach(([fig, pose], i) => {
            const x = xs[i];
            fig.draw(c, { ...pose, x, y: hillY(x) + 22, facing: i % 2 ? -1 : 1 }, t);
          });
        },
      });
      return;
    }
    // 其余页：白纸上
    applyCamera(ctx, new Camera(960, 540, 1), 1, R.base);
    const F = fgOf(ctx);
    if (seg === 1) {
      paperGround(ctx, 470, 980);
      for (let i = 0; i < 8; i++) {
        const ph = i / 8;
        GIRL9.draw(F, { ...walk(ph, { stride: 0.42 }), x: 160 + i * 220, y: 470, facing: 1, idle: false, expr: 'happy' }, 0);
        GRANDPA.draw(F, { ...walk(ph, { stride: 0.32, lean: 0.12, arm: 0.2 }), x: 160 + i * 220, y: 980, facing: 1, idle: false }, 0);
      }
      return;
    }
    if (seg === 2) {
      paperGround(ctx, 520);
      for (let i = 0; i < 8; i++) {
        const ph = i / 8;
        const k = 2.2;
        const x = 140 + i * 230, y = 520;
        ctx.save();
        F.save();
        F.translate(x, y); F.scale(k, k); F.translate(-x, -y);
        GIRL6.draw(F, { ...run(ph, { stride: 0.62 }), x, y, facing: 1, idle: false, expr: 'joy' }, ph);
        F.restore();
        ctx.restore();
      }
      return;
    }
    if (seg === 3) {
      // 表情表：每格只露头肩，格子之间互不遮挡
      const names = Object.keys(EXPR);
      const LBL = { neutral: '平静', happy: '开心', joy: '欢喜', laugh: '大笑', surprised: '惊讶', sad: '难过', tender: '温柔', sleepy: '困倦', focused: '专注' };
      const W8 = whiteOf(F);
      const cw = 384, ch = 540;
      names.forEach((nm, i) => {
        const col = i % 5, row = Math.floor(i / 5);
        const x0 = col * cw + (row ? cw / 2 : 0), y0 = row * ch;
        const fig = i % 3 === 2 ? GRANDPA : i % 3 === 1 ? WOMAN : GIRL6;
        const pose = { ...POSE.stand, expr: nm, x: 0, y: 0, facing: 1, idle: false, noShadow: true };
        const J = fig.joints(pose);
        const k = 92 / fig.L.headR;
        for (const c of [F, W8]) {
          c.save();
          c.beginPath();
          c.rect(x0 + 14, y0 + 14, cw - 28, ch - 100);
          c.clip();
        }
        F.save();
        F.translate(x0 + cw / 2, y0 + 210);
        F.scale(k, k);
        F.translate(-J.head[0], -J.head[1]);
        fig.draw(F, pose, 0.3);
        F.restore();
        for (const c of [W8, F]) c.restore();
        line(ctx, [[x0 + 14, y0 + ch - 86], [x0 + cw - 14, y0 + ch - 86]], 1.0, inkRGB(0.4), 0.5);
        inkText(ctx, LBL[nm], x0 + cw / 2, y0 + ch - 50, { size: 34, font: 'ZCOOLXiaoWei', tone: 0.85 });
      });
      return;
    }
    // 爷爷的姿势
    paperGround(ctx, 820);
    const poses = [POSE.stand, POSE.standOld, POSE.wave, POSE.holdUp, POSE.sitOld, POSE.doze];
    poses.forEach((pz, i) => {
      const x = 220 + i * 300, y = 820, k = 2.6;
      ctx.save();
      ctx.translate(x, y); ctx.scale(k, k); ctx.translate(-x, -y);
      if (pz.legF[0] > 1.2) drawStool(ctx, x + 4, y, 1.35);
      ctx.restore();
      F.save();
      F.translate(x, y); F.scale(k, k); F.translate(-x, -y);
      GRANDPA.draw(F, { ...pz, x, y, sit: pz.legF[0] > 1.2 ? 27 : undefined, facing: 1 }, 1.0);
      F.restore();
    });
  },
};
