// 宣纸纹理：底色 + 低频斑驳 + 纤维 + 细颗粒。每个渲染进程生成一次。
import { mulberry32 } from '../core/noise.js';
import { makeNoise2 } from '../core/noise.js';
import { makeCanvas } from '../core/canvas.js';

export const PAPER_RGB = [239, 231, 213];

export function makePaper(W, H, seed = 7) {
  const sc = W / 1920;
  // 低频斑驳：低分辨率生成再放大
  const lw = Math.ceil(W / 8), lh = Math.ceil(H / 8);
  const low = makeCanvas(lw, lh);
  const lctx = low.ctx;
  const limg = lctx.createImageData(lw, lh);
  const n2 = makeNoise2(seed);
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const X = (x * 8) / sc, Y = (y * 8) / sc;
      let v = 0.55 * n2(X * 0.0016, Y * 0.0016) + 0.3 * n2(X * 0.005, Y * 0.005) + 0.15 * n2(X * 0.016, Y * 0.016);
      const i = (y * lw + x) * 4;
      limg.data[i] = PAPER_RGB[0] + v * 7;
      limg.data[i + 1] = PAPER_RGB[1] + v * 7;
      limg.data[i + 2] = PAPER_RGB[2] + v * 8;
      limg.data[i + 3] = 255;
    }
  }
  lctx.putImageData(limg, 0, 0);

  const paper = makeCanvas(W, H);
  const ctx = paper.ctx;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(low, 0, 0, W, H);

  // 细颗粒
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const rnd = mulberry32(seed * 31 + 5);
  for (let i = 0; i < d.length; i += 4) {
    const g = (rnd() - 0.5) * 6;
    d[i] += g; d[i + 1] += g; d[i + 2] += g * 0.9;
  }
  ctx.putImageData(img, 0, 0);

  // 纤维：同时画到纤维图（供后期着色器做洇墨方向）
  const fiber = makeCanvas(W, H);
  const fctx = fiber.ctx;
  fctx.fillStyle = '#000';
  fctx.fillRect(0, 0, W, H);
  const count = Math.round(9000 * sc * sc + 2500);
  ctx.lineCap = fctx.lineCap = 'round';
  for (let k = 0; k < count; k++) {
    const x = rnd() * W, y = rnd() * H;
    const len = (6 + rnd() * 28) * sc;
    const a = rnd() * Math.PI * 2;
    const bend = (rnd() - 0.5) * 0.9;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    const cx = (x + x2) / 2 + Math.cos(a + Math.PI / 2) * len * bend * 0.3;
    const cy = (y + y2) / 2 + Math.sin(a + Math.PI / 2) * len * bend * 0.3;
    const light = rnd() < 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.lineWidth = (0.5 + rnd() * 0.9) * sc;
    ctx.strokeStyle = light ? `rgba(255,253,246,${0.18 + rnd() * 0.22})` : `rgba(150,135,110,${0.05 + rnd() * 0.08})`;
    ctx.stroke();
    fctx.beginPath();
    fctx.moveTo(x, y);
    fctx.quadraticCurveTo(cx, cy, x2, y2);
    fctx.lineWidth = (0.8 + rnd() * 1.2) * sc;
    fctx.strokeStyle = `rgba(255,255,255,${0.35 + rnd() * 0.5})`;
    fctx.stroke();
  }
  // 少量深色杂质点
  for (let k = 0; k < 160 * sc + 40; k++) {
    ctx.fillStyle = `rgba(120,105,85,${0.08 + rnd() * 0.12})`;
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H, (0.4 + rnd() * 1.1) * sc, 0, Math.PI * 2);
    ctx.fill();
  }
  return { paper, fiber };
}
