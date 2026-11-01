// 角色对比图（开发用）：lt<1 近景，lt>=1 主机位比例
import { drawMaster } from '../world/master.js';
import { Camera } from '../core/camera.js';
import { GRANDPA, GIRL6, GIRL9, GIRL12, TEEN, WOMAN_MOURN, WOMAN, DAUGHTER } from '../actors/cast.js';
import { POSE, walk, run } from '../actors/rig.js';
import { hillY } from '../world/landscape.js';

export default {
  id: 'CAST',
  dur: 3,
  render(ctx, t, R) {
    const zoom = t < 1 ? 3.2 : t < 2 ? 1 : 3.2;
    const cam = new Camera(1150, 640, zoom);
    drawMaster(ctx, t, R, {
      cam, season: 'spring',
      actors: (c) => {
        const xs = [1000, 1040, 1075, 1112, 1150, 1195, 1240, 1290, 1330];
        const list = [
          [GRANDPA, t < 2 ? POSE.stand : POSE.sit, {}],
          [GRANDPA, t < 2 ? POSE.standOld : POSE.doze, {}],
          [GIRL6, t < 2 ? POSE.stand : run(0.3), { mouth: 'open' }],
          [GIRL9, t < 2 ? POSE.stand : POSE.holdReel, {}],
          [GIRL12, t < 2 ? POSE.stand : walk(0.25), {}],
          [TEEN, t < 2 ? POSE.stand : POSE.wave, {}],
          [WOMAN_MOURN, t < 2 ? POSE.stand : POSE.hug, {}],
          [WOMAN, t < 2 ? POSE.stand : POSE.point, {}],
          [DAUGHTER, t < 2 ? POSE.stand : POSE.jump, {}],
        ];
        list.forEach(([fig, pose, extra], i) => {
          const x = xs[i];
          const y = hillY(x) + 22;
          fig.draw(c, { ...pose, ...extra, x, y, facing: i % 2 ? -1 : 1, sit: pose.legF && pose.legF[0] > 1.2 ? 20 : undefined }, t);
        });
      },
    });
  },
};
