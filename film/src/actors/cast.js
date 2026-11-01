// 角色表（v2：服饰配色与细节）
import { Figure } from './rig.js';

export const GRANDPA = new Figure({
  height: 112, headR: 9.2, style: 'grandpa', jacket: [70, 76, 90], collar: [96, 102, 116], trousers: [148, 140, 128],
  shoes: [34, 32, 32], hem: 0.13, buttons: true, cuffLight: 0.22,
});
export const GIRL6 = new Figure({
  height: 68, headR: 10, child: true, style: 'buns', jacket: [238, 192, 178], collar: [246, 226, 214], trousers: [106, 118, 140],
  shoes: [36, 34, 34], hem: 0.1, hair: [26, 24, 24],
});
export const GIRL9 = new Figure({
  height: 78, headR: 9.8, child: true, style: 'ponytail', jacket: [236, 204, 178], collar: [246, 232, 214], trousers: [106, 116, 136],
  shoes: [36, 34, 34], hem: 0.1, hair: [26, 24, 24],
});
export const GIRL12 = new Figure({
  height: 90, headR: 9.4, style: 'ponytail', jacket: [224, 200, 166], collar: [240, 228, 206], trousers: [98, 108, 126],
  shoes: [36, 34, 34], hem: 0.12, build: 1.1, hair: [26, 24, 24],
});
export const TEEN = new Figure({
  height: 100, headR: 9.0, style: 'ponytail', jacket: [184, 198, 214], collar: [240, 242, 244], trousers: [80, 86, 102],
  shoes: [36, 34, 34], hem: 0.14, backpack: true, build: 1.05, hair: [26, 24, 24],
});
export const WOMAN_MOURN = new Figure({
  height: 104, headR: 8.8, style: 'bun', jacket: [46, 46, 52], sleeve: [46, 46, 52], collar: [60, 60, 66], trousers: [58, 58, 64],
  shoes: [30, 30, 32], hem: 0.4, flare: 1.22, build: 1.08, scarf: [244, 242, 238], cuffLight: 0.1, hair: [24, 22, 22],
});
export const WOMAN = new Figure({
  height: 104, headR: 8.8, style: 'bun', jacket: [168, 186, 172], collar: [214, 224, 214], trousers: [88, 94, 106],
  shoes: [36, 34, 34], hem: 0.36, flare: 1.16, build: 1.08, hair: [24, 22, 22],
});
export const DAUGHTER = new Figure({
  height: 66, headR: 10, child: true, style: 'buns', jacket: [244, 210, 140], collar: [250, 236, 200], trousers: [106, 118, 140],
  shoes: [36, 34, 34], hem: 0.1, hair: [26, 24, 24],
});
