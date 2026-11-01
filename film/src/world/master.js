// 主场景：远山、云雾、山坡、老梨树、小屋、小路。所有山坡镜头共用这一个世界，
// 中景/近景只是把相机推近。
import { Camera, applyCamera } from '../core/camera.js';
import { lerp } from '../core/math.js';
import { inkRGB, fgOf, whiteOf } from '../ink/brush.js';
import { frameBranch, drawBeams } from './frame.js';
import { drawVillage, drawPagoda, drawRidgeTrees, drawWildflowers, drawStones, drawSteps, drawCourtyard } from './details.js';
import { MASTER_RANGES, drawRange, drawMist } from './mountains.js';
import { drawHill, drawBank, drawPath, drawRoad, drawCottage, drawGrass, drawSky } from './landscape.js';
import { drawPetals, drawLeavesFalling, drawSnowfall } from './particles.js';
import { PearTree } from './tree.js';
import { C, SEASONS } from './palette.js';
import { drawClouds } from './sky.js';

export const TREE = new PearTree([1290, 716], 5, 1);
export const STOOL = [1212, 724];

const MIST = [
  { y: 650, x0: -600, x1: 2600, w: 620, h: 70, alpha: 0.9, parallax: 0.16, speed: 5, seed: 2, puffs: 8 },
  { y: 735, x0: -600, x1: 2600, w: 560, h: 60, alpha: 0.85, parallax: 0.28, speed: 7, seed: 4, puffs: 8 },
  { y: 800, x0: -600, x1: 1800, w: 420, h: 46, alpha: 0.8, parallax: 0.42, speed: 9, seed: 6, puffs: 7 },
];

function mixc(a, b, t) {
  return a.map((v, i) => lerp(v, b[i], t));
}

/**
 * o: { cam, season, bloom, leaves, autumn, snow, wind, smoke, sky:{...},
 *      petals, fallingLeaves, snowfall, actors(ctx), front(ctx), hideCottage }
 */
export function drawMaster(ctx, t, R, o = {}) {
  const cam = o.cam || new Camera();
  const season = o.season || 'spring';
  const S = SEASONS[season];
  const snow = o.snow ?? (season === 'winter' ? 1 : 0);

  ctx.setTransform(R.base, 0, 0, R.base, 0, 0);
  drawSky(ctx, o.sky || {});
  if (o.clouds) drawClouds(ctx, cam, R.base, t, { alpha: o.clouds });

  // 远山（季节淡彩）
  MASTER_RANGES.forEach((L, i) => {
    const col = mixc(inkRGB(L.tone), S.mountainTint.map((v) => v * (0.55 + L.tone * 0.4)), 0.25);
    drawRange(ctx, L, cam, R.base, { color: col.map(Math.round) });
    // 远景点景：中景山脊上一座小塔；近山脊上几株小树；山谷里半掩在雾里的村落
    if (i === 1 && !o.noVillage) drawPagoda(ctx, cam, R.base, L);
    if (i === 2 && !o.noVillage) {
      drawRidgeTrees(ctx, cam, R.base, L, [150, 600, 990, 1830]);
      drawVillage(ctx, cam, R.base, { snow: snow > 0.4 ? snow : 0 });
    }
    drawMist(ctx, cam, R.base, [MIST[i]], t);
  });

  applyCamera(ctx, cam, 1, R.base);
  drawHill(ctx, t, { seasonColor: S.hill, colorAmt: S.hillAmt, snow });
  // 山坡上的野花（春天满坡，夏天零星）与石块
  const fl = (o.flowers ?? (season === 'spring' ? 1 : season === 'summer' ? 0.35 : 0)) * (1 - snow);
  if (fl > 0) drawWildflowers(ctx, t, { amount: fl });
  drawStones(ctx);
  if (!o.hideCottage) {
    drawRoad(ctx, { color: season === 'winter' ? [214, 220, 228] : undefined });
    drawCottage(ctx, t, { smoke: o.smoke ?? 0, snow });
    drawCourtyard(ctx, t, { snow });
  }
  drawPath(ctx, { color: season === 'winter' ? [214, 220, 228] : undefined });
  drawSteps(ctx, { alpha: 1 - snow * 0.7 });
  drawBank(ctx, t, { seasonColor: S.hill, colorAmt: S.hillAmt, snow });
  if (o.behindTree) o.behindTree(ctx);
  TREE.draw(ctx, t, {
    wind: o.wind ?? 0.6,
    bloom: o.bloom ?? (season === 'spring' ? 1 : 0),
    bloomWave: o.bloomWave,
    leaves: o.leaves ?? (season === 'summer' ? 1 : season === 'autumn' ? 0.55 : 0),
    autumn: o.autumn ?? (season === 'autumn' ? 1 : 0),
    snow,
  });
  // 透过树冠的光束（背景白粉层）
  if (o.beams) drawBeams(whiteOf(ctx), t, o.beams, o.beamOpts || {});
  // 以下进入前景层：人物、道具、前景草、花瓣落叶、雪
  const F = fgOf(ctx);
  if (o.actors) { F.save(); o.actors(F); F.restore(); }
  if (!o.noGrass) drawGrass(fgOf(ctx), t, { wind: o.wind ?? 0.6, color: S.grass, colorAmt: season === 'winter' ? 0.2 : 0.65 });
  if (o.petals) drawPetals(fgOf(ctx), t, { region: o.petalRegion || [500, 150, 1900, 1000], count: o.petals, vx: -(o.petalWind ?? 70), vy: 32, seed: 3, size: o.petalSize ?? 3.2 });
  if (o.fallingLeaves) drawLeavesFalling(fgOf(ctx), t, { region: [800, 300, 1800, 950], count: o.fallingLeaves, vx: -30, vy: 45 });
  if (o.front) { const G = fgOf(ctx); G.save(); o.front(G); G.restore(); }
  if (o.snowfall) {
    const G = fgOf(ctx);
    G.setTransform(R.base, 0, 0, R.base, 0, 0);
    drawSnowfall(G, t, { region: [0, 0, 1920, 1080], count: o.snowfall, vx: -(o.snowWind ?? 18), vy: 50, size: 3.2 });
  }
  // 镜头前虚化的花枝（前景框）
  if (o.frame) {
    const list = Array.isArray(o.frame) ? o.frame : [o.frame];
    for (const fr of list) frameBranch(fgOf(ctx), R, { t, wind: o.wind ?? 0.6, ...fr });
  }
}
