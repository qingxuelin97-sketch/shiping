// 道具对比图（开发用）
import { drawKite, drawString, drawReel, drawStool, drawSwallow, drawKnot, kiteBridle } from '../actors/props.js';

export default {
  id: 'PROPS',
  dur: 1,
  render(ctx, t) {
    const ks = [
      { x: 260, y: 300, size: 170, frame: 1, paper: 0 },
      { x: 680, y: 300, size: 170, paint: 0.5 },
      { x: 1100, y: 300, size: 170, paint: 1, patch: 1 },
      { x: 1520, y: 300, size: 170, paint: 1, aged: 1, patch: 1, torn: 1, rot: 0.2 },
    ];
    ks.forEach((k) => drawKite(ctx, { ...k, lineW: 2.2 }));
    drawKite(ctx, { x: 1500, y: 760, size: 60, rot: -0.2, paint: 1 });
    drawString(ctx, [900, 1000], kiteBridle({ x: 1500, y: 760, size: 60, rot: -0.2 }), { width: 2, t });
    drawKnot(ctx, [1180, 900], 6);
    drawReel(ctx, 300, 820, 60, 0.3);
    drawStool(ctx, 600, 900, 3);
    for (let i = 0; i < 5; i++) drawSwallow(ctx, 900 + i * 90, 700 + (i % 2) * 30, 30, -0.2, i * 0.2);
  },
};
