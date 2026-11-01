// 全片色板（场景空间：白 = 纸，颜色用 multiply 叠在纸上）
export const C = {
  ink: [24, 22, 21],
  vermilion: [196, 52, 38],
  springGreen: [176, 202, 160],
  springLeaf: [150, 182, 128],
  blossomPink: [238, 205, 205],
  summerGreen: [118, 154, 104],
  summerDeep: [84, 116, 82],
  autumnOchre: [206, 152, 84],
  autumnRust: [178, 98, 58],
  autumnPale: [226, 196, 150],
  winterBlue: [178, 190, 204],
  winterShadow: [150, 162, 178],
  sunset: [238, 184, 132],
  sunsetDeep: [222, 140, 96],
  dawn: [240, 214, 196],
  skin: [246, 226, 208],
  cheek: [232, 160, 150],
  wood: [150, 118, 86],
  bamboo: [196, 170, 120],
};

// 各季节的风景参数
export const SEASONS = {
  spring: { hill: C.springGreen, hillAmt: 0.45, mountainTint: [205, 215, 205], grass: C.springLeaf },
  summer: { hill: C.summerGreen, hillAmt: 0.55, mountainTint: [190, 205, 190], grass: C.summerGreen },
  autumn: { hill: C.autumnOchre, hillAmt: 0.45, mountainTint: [215, 200, 180], grass: C.autumnOchre },
  winter: { hill: C.winterBlue, hillAmt: 0.2, mountainTint: [200, 206, 214], grass: C.winterShadow },
};
