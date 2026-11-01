// 角色表
import { Figure } from './rig.js';

export const GRANDPA = new Figure({ height: 112, headR: 9.2, style: 'grandpa', jacket: [84, 86, 92], trousers: [150, 146, 138], shoes: 0.95, hem: 0.12, buttons: true });
export const GIRL6 = new Figure({ height: 68, headR: 10, child: true, style: 'buns', jacket: [236, 196, 184], trousers: [120, 124, 134], shoes: 0.9, hem: 0.1, hair: 0.95 });
export const GIRL9 = new Figure({ height: 78, headR: 9.8, child: true, style: 'ponytail', jacket: [232, 200, 184], trousers: [120, 124, 134], hem: 0.1 });
export const GIRL12 = new Figure({ height: 90, headR: 9.4, style: 'ponytail', jacket: [218, 196, 178], trousers: [112, 116, 126], hem: 0.12, build: 1.1 });
export const TEEN = new Figure({ height: 100, headR: 9.0, style: 'ponytail', jacket: [190, 202, 214], trousers: [92, 96, 108], hem: 0.14, backpack: true, build: 1.05 });
export const WOMAN_MOURN = new Figure({ height: 104, headR: 8.8, style: 'bun', jacket: [52, 52, 56], sleeve: [52, 52, 56], trousers: [64, 64, 68], shoes: 0.95, hem: 0.38, flare: 1.2, build: 1.08 });
export const WOMAN = new Figure({ height: 104, headR: 8.8, style: 'bun', jacket: [176, 190, 182], trousers: [96, 100, 108], hem: 0.34, flare: 1.15, build: 1.08 });
export const DAUGHTER = new Figure({ height: 66, headR: 10, child: true, style: 'buns', jacket: [240, 214, 150], trousers: [120, 124, 134], hem: 0.1 });
