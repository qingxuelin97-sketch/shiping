// 高空：水墨淡云（世界坐标 y<0 的区域），带视差
import { applyCamera } from '../core/camera.js';
import { Rng, noise1, hash } from '../core/noise.js';
import { rgba, inkRGB, softDot, whiteOf } from '../ink/brush.js';
import { TAU } from '../core/math.js';

const CLOUDS = (() => {
  const rng = new Rng(808);
  const out = [];
  for (let k = 0; k < 26; k++) {
    out.push({
      x: rng.range(-900, 2900), y: rng.range(-1900, -120), w: rng.range(160, 420), h: rng.range(50, 120),
      p: rng.range(0.55, 0.95), seed: rng.range(0, 999), puffs: rng.int(5, 9), speed: rng.range(4, 12),
    });
  }
  return out;
})();

export function drawClouds(ctx, cam, base, t, o = {}) {
  const tone = o.tone ?? 0.22;
  const al = o.alpha ?? 1;
  for (const c of CLOUDS) {
    ctx.save();
    applyCamera(ctx, cam, c.p, base);
    ctx.globalCompositeOperation = 'multiply';
    const x0 = c.x - t * c.speed * (o.windDir ?? -1) * -1;
    for (let i = 0; i < c.puffs; i++) {
      const u = i / (c.puffs - 1) - 0.5;
      const px = x0 + u * c.w + noise1(i * 1.3, c.seed) * c.w * 0.15;
      const py = c.y - Math.cos(u * Math.PI) * c.h * 0.45 + noise1(i * 2.1, c.seed + 4) * c.h * 0.2;
      const r = c.h * (0.6 + 0.5 * (1 - Math.abs(u) * 1.4)) * (0.8 + hash(c.seed, i) * 0.5);
      softDot(ctx, px, py + r * 0.25, r * 1.15, inkRGB(tone), 0.22 * al, 0.62);
    }
    const W8 = whiteOf(ctx);
    if (W8) {
      for (let i = 0; i < c.puffs; i++) {
        const u = i / (c.puffs - 1) - 0.5;
        const px = x0 + u * c.w + noise1(i * 1.3, c.seed) * c.w * 0.15;
        const py = c.y - Math.cos(u * Math.PI) * c.h * 0.45 + noise1(i * 2.1, c.seed + 4) * c.h * 0.2;
        const r = c.h * (0.6 + 0.5 * (1 - Math.abs(u) * 1.4)) * (0.8 + hash(c.seed, i) * 0.5);
        const g = W8.createRadialGradient(px, py - r * 0.2, 0, px, py - r * 0.2, r);
        g.addColorStop(0, `rgba(255,255,255,${0.75 * al})`);
        g.addColorStop(0.6, `rgba(255,255,255,${0.35 * al})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        W8.fillStyle = g;
        W8.beginPath();
        W8.ellipse(px, py - r * 0.2, r, r * 0.7, 0, 0, TAU);
        W8.fill();
      }
    }
    ctx.restore();
  }
}
