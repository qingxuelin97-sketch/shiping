// 统一创建 2D 画布。headless Chromium 里 GPU 画布走 SwiftShader 很慢，
// willReadFrequently 会强制用 CPU 光栅化，实测快十倍以上。
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  c.ctx = c.getContext('2d', { willReadFrequently: true });
  return c;
}
export function ctxOf(c) {
  if (!c.ctx) c.ctx = c.getContext('2d', { willReadFrequently: true });
  return c.ctx;
}
