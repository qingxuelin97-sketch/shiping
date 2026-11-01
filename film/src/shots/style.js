// 风格样张：主机位四季（lt 0..1 春, 1..2 夏, 2..3 秋, 3..4 冬）
import { drawMaster } from '../world/master.js';
import { Camera } from '../core/camera.js';
import { C } from '../world/palette.js';

export default {
  id: 'STYLE',
  dur: 4,
  post: (t) => (t >= 3 ? { sat: 0.35, tint: [0.97, 0.99, 1.03] } : t >= 2 ? { tint: [1.02, 0.99, 0.95] } : {}),
  render(ctx, t, R) {
    const k = Math.floor(t);
    const season = ['spring', 'summer', 'autumn', 'winter'][Math.min(3, k)];
    const zoomed = (t % 1) > 0.75;
    const cam = zoomed ? new Camera(1215, 640, 3.0) : new Camera();
    drawMaster(ctx, t, R, {
      cam,
      season,
      smoke: 1,
      petals: season === 'spring' ? 40 : 0,
      fallingLeaves: season === 'autumn' ? 24 : 0,
      snowfall: season === 'winter' ? 160 : 0,
      sky: season === 'summer' ? { horizon: C.sunset, horAlpha: 0.5, sun: [520, 560, 44], sunColor: [226, 150, 112], sunAlpha: 0.8 } : season === 'winter' ? { top: [214, 220, 228], topAlpha: 0.8 } : {},
    });
  },
};
