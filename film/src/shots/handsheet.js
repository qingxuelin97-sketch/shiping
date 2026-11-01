// 近景手与道具检查图（开发用）
import { applyCamera, Camera } from '../core/camera.js';
import { fgOf } from '../ink/brush.js';
import { drawHand, drawReelHi, drawFrayString } from '../actors/closeup.js';
import { inkText } from './common.js';
import { frameBranch } from '../world/frame.js';

const GP_SLEEVE = [70, 76, 90], GP_CUFF = [104, 110, 124];
const GIRL_SLEEVE = [238, 192, 178], GIRL_CUFF = [246, 226, 214];

export default {
  id: 'HANDS',
  dur: 3,
  render(ctx, t, R) {
    applyCamera(ctx, new Camera(960, 540, 1), 1, R.base);
    const F = fgOf(ctx);
    if (t >= 2) {
      frameBranch(F, R, { corner: 'tl', kind: 'blossom', len: 560, dip: 0.35, blur: 16, alpha: 0.95, seed: 4, t });
      frameBranch(F, R, { corner: 'br', kind: 'snow', len: 560, dip: 0.35, blur: 4, alpha: 0.95, seed: 5, t });
      frameBranch(F, R, { corner: 'tr', kind: 'bare', len: 560, dip: 0.35, blur: 0, alpha: 0.95, seed: 6, t });
      return;
    }
    if (t < 1) {
      const lab = (s, x, y) => inkText(ctx, s, x, y, { size: 26, font: 'ZCOOLXiaoWei', tone: 0.7 });
      // 老人的手：手背，张开 / 半握 / 握拳
      [0.05, 0.5, 0.95].forEach((c, i) => {
        drawHand(F, { x: 180 + i * 300, y: 300, ang: 0.35, s: 120, kind: 'old', view: 'back', curl: c, thumb: c * 0.8, sleeve: GP_SLEEVE, cuff: GP_CUFF, sleeveLen: 260 });
        lab(`老人 手背 curl ${c}`, 230 + i * 300, 480);
      });
      // 孩子的手：手心，张开 / 合拢
      [0.15, 0.7].forEach((c, i) => {
        drawHand(F, { x: 1080 + i * 330, y: 360, ang: -0.6, s: 100, kind: 'child', view: 'palm', curl: c, thumb: c * 0.6, thumbA: -0.9, sleeve: GIRL_SLEEVE, cuff: GIRL_CUFF, sleeveLen: 200, mirror: i === 1 });
        lab(`孩子 手心 curl ${c}`, 1160 + i * 330, 480);
      });
      // 女人的手：手背，伸手去拿
      drawHand(F, { x: 1700, y: 240, ang: 1.9, s: 110, kind: 'adult', view: 'back', curl: [0.3, 0.35, 0.42, 0.5], thumb: 0.3, sleeve: [46, 46, 52], cuff: [70, 70, 76], sleeveLen: 220 });
      lab('女人 手背', 1720, 480);
      // 线拐子
      drawReelHi(F, 300, 780, 150, 0.15, {});
      drawReelHi(F, 760, 780, 150, -0.2, { snow: 1 });
      // 老人握着线拐子
      drawReelHi(F, 1250, 780, 130, 0.3, {});
      drawHand(F, { x: 1470, y: 650, ang: 2.55, s: 130, kind: 'old', view: 'back', curl: [0.92, 0.95, 0.95, 0.9], thumb: 0.35, thumbA: -0.5, sleeve: GP_SLEEVE, cuff: GP_CUFF, sleeveLen: 300, mirror: true });
      return;
    }
    // 磨断的红线
    [0, 0.3, 0.6, 0.9].forEach((fr, i) => drawFrayString(F, [80 + i * 470, 420], [460 + i * 470, 120], { t: 0.3, w: 14, fray: fr, at: 0.5, vib: 0.3 }));
    [0.05, 0.2, 0.45, 0.8].forEach((k, i) => drawFrayString(F, [80 + i * 470, 960], [460 + i * 470, 660], { t: 0.3, w: 14, fray: 1, after: k, at: 0.5 }));
  },
};
