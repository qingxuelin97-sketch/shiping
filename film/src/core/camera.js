// 2D 相机：位置、缩放、旋转，带视差。
// 世界坐标以 1920×1080 的主机位为基准；p=1 跟随相机，p=0 固定在屏幕上。
import { noise1 } from './noise.js';

export const VW = 1920, VH = 1080;

export class Camera {
  constructor(x = VW / 2, y = VH / 2, zoom = 1, rot = 0) {
    this.x = x; this.y = y; this.zoom = zoom; this.rot = rot;
  }
  static from(o) {
    return new Camera(o.x ?? VW / 2, o.y ?? VH / 2, o.zoom ?? 1, o.rot ?? 0);
  }
  // 手持轻微晃动
  withShake(t, amp = 2, freq = 0.4, seed = 0) {
    const c = new Camera(this.x, this.y, this.zoom, this.rot);
    c.x += noise1(t * freq, seed + 1) * amp;
    c.y += noise1(t * freq, seed + 2) * amp * 0.7;
    c.rot += noise1(t * freq * 0.7, seed + 3) * amp * 0.0004;
    return c;
  }
}

// 设置 ctx 的变换：base 为分辨率缩放（预览 0.5，成片 1）
export function applyCamera(ctx, cam, p = 1, base = 1) {
  const z = Math.pow(cam.zoom, p);
  ctx.setTransform(base, 0, 0, base, 0, 0);
  ctx.translate(VW / 2, VH / 2);
  if (cam.rot) ctx.rotate(cam.rot * p);
  ctx.scale(z, z);
  ctx.translate(-(VW / 2 + (cam.x - VW / 2) * p), -(VH / 2 + (cam.y - VH / 2) * p));
}

export function screenTransform(ctx, base = 1) {
  ctx.setTransform(base, 0, 0, base, 0, 0);
}

// 世界坐标 → 屏幕虚拟坐标（用于把相机内的点交给屏幕层，如红线穿出画面）
export function worldToScreen(cam, pt, p = 1) {
  const z = Math.pow(cam.zoom, p);
  let x = (pt[0] - (VW / 2 + (cam.x - VW / 2) * p)) * z;
  let y = (pt[1] - (VH / 2 + (cam.y - VH / 2) * p)) * z;
  if (cam.rot) {
    const c = Math.cos(cam.rot * p), s = Math.sin(cam.rot * p);
    [x, y] = [x * c - y * s, x * s + y * c];
  }
  return [x + VW / 2, y + VH / 2];
}
