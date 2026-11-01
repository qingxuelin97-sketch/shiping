// 引擎自测镜头：笔触、墨点、晕染、朱红
import { stroke, blob, softDot, ink, inkMode, normalMode, VERMILION, rgba } from '../ink/brush.js';
import { spline } from '../core/math.js';

export default {
  id: 'TEST',
  dur: 2,
  render(ctx, t) {
    inkMode(ctx);
    softDot(ctx, 600, 520, 380, [120, 118, 112], 0.35, 0.5);
    for (let i = 0; i < 6; i++) {
      const y = 180 + i * 120;
      stroke(ctx, spline([[200, y], [600, y - 60 + t * 20], [1000, y + 40], [1500, y - 20]]), {
        w: 10 + i * 9, tone: 0.92 - i * 0.08, dry: 0.15 + i * 0.15, seed: i + 1,
      });
    }
    for (let i = 0; i < 40; i++) blob(ctx, 1600 + (i % 8) * 34, 200 + Math.floor(i / 8) * 40, 8 + (i % 5) * 3, { tone: 0.5 + (i % 4) * 0.12, seed: i });
    normalMode(ctx);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = rgba(VERMILION, 1);
    ctx.beginPath();
    ctx.moveTo(300, 1000);
    ctx.quadraticCurveTo(900, 900, 1700, 80);
    ctx.stroke();
    ctx.fillStyle = ink(0.9);
    ctx.font = '160px MaShanZheng';
    ctx.fillText('纸鸢', 1250, 900);
  },
};
