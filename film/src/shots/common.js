// 镜头共用工具：地面、凳子、风筝飞行、文字、印章、插入镜头的纸面、毛笔与手臂、汽车
import { hillY, PATH } from '../world/landscape.js';
import { applyCamera, Camera } from '../core/camera.js';
import { stroke, blob, rgba, inkRGB, softDot, whiteOf, line } from '../ink/brush.js';
import { clamp, lerp, TAU, smoothstep, along, Ease } from '../core/math.js';
import { noise1, hash } from '../core/noise.js';
import { C } from '../world/palette.js';
import { drawStool } from '../actors/props.js';
import { TREE } from '../world/master.js';
import { drawHand as drawHandCU } from '../actors/closeup.js';

// 挂在树上的风筝：取树冠左下一根枝条上的点（需在当帧画完树之后调用）
let CAUGHT = null;
export function caughtKite() {
  if (!CAUGHT) CAUGHT = TREE.findBranchNear(1066, 574, 2, 4);
  return TREE.pointOn(CAUGHT.id, CAUGHT.s);
}

export const ground = (x) => hillY(x) + 3;
export const STOOL_X = 1212;
export const stoolY = () => ground(STOOL_X) + 2;
export const SEAT = 27;
export function stool(ctx, snow = 0) {
  drawStool(ctx, STOOL_X, stoolY(), 1.35, snow);
}

// 沿小路的位置：s=0 树下，s=1 山脚大路
export function pathAt(s) {
  return along(PATH, clamp(s)).p;
}
// 近大远小：山坡上越往下离镜头越近
export function depthScale(y) {
  return 1 + Math.max(0, y - 730) / 520;
}
export function scaled(ctx, x, y, k, fn) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.translate(-x, -y);
  fn();
  ctx.restore();
}

// 风筝在空中的轻微摆动
export function kiteWobble(t, seed = 1, amp = 1) {
  return {
    dx: (noise1(t * 0.45, seed + 41) * 26 + Math.sin(t * 1.3 + seed) * 5) * amp,
    dy: (noise1(t * 0.55, seed + 42) * 16 + Math.sin(t * 2.1 + seed) * 3) * amp,
    rot: (noise1(t * 0.9, seed + 43) * 0.16 + Math.sin(t * 2.6 + seed) * 0.04) * amp,
  };
}

// ---------- 文字 ----------
// 墨迹由虚到实地浮现：p 0..1
export function inkText(ctx, text, x, y, o = {}) {
  const p = clamp(o.p ?? 1);
  if (p <= 0) return;
  const size = o.size ?? 64;
  const font = `${o.weight ?? ''} ${size}px ${o.font ?? 'ZhiMangXing'}`.trim();
  const col = o.color || inkRGB(o.tone ?? 0.9);
  const chars = o.vertical ? [...text] : [text];
  const step = o.vertical ? size * (o.spacing ?? 1.05) : 0;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.font = font;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    const local = o.stagger ? clamp(p * (1 + o.stagger * (chars.length - 1)) - i * o.stagger) : p;
    if (local <= 0) return;
    const cx = x, cy = y + i * step;
    const blurPx = (1 - local) * size * 0.12;
    ctx.save();
    const m = ctx.getTransform();
    const sc = Math.hypot(m.a, m.b);
    if (blurPx > 0.3) ctx.filter = `blur(${(blurPx * sc).toFixed(1)}px)`;
    ctx.globalAlpha = Math.pow(local, 0.8) * (o.alpha ?? 1);
    ctx.fillStyle = rgba(col, 1);
    ctx.fillText(ch, cx, cy);
    ctx.restore();
  });
  ctx.restore();
}

// 朱红印章：p 为盖章进度
export function seal(ctx, x, y, s, text, p = 1) {
  if (p <= 0) return;
  const k = Ease.outBack(clamp(p));
  const sc = lerp(1.35, 1, k);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc, sc);
  ctx.globalAlpha = clamp(p * 2.5);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = rgba(C.vermilion, 0.95);
  ctx.beginPath();
  ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.08);
  ctx.fill();
  // 白文：字镂空成纸色
  ctx.fillStyle = 'rgba(250,244,232,1)';
  ctx.font = `${s * 0.72}px MaShanZheng`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, s * 0.04);
  // 印泥不匀
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const a = hash(i, 7) * TAU, r = s * (0.25 + hash(i, 9) * 0.3);
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, s * 0.03 * (0.5 + hash(i, 3)), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- 插入镜头：桌上的一张纸 ----------
export function insertBg(ctx, o = {}) {
  ctx.save();
  ctx.setTransform(o.base ?? 1, 0, 0, o.base ?? 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  // 木桌的淡影（四周）
  const g = ctx.createRadialGradient(960, 560, 380, 960, 560, 1150);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, rgba(o.edge || [214, 200, 178], 0.65));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.restore();
}

// 毛笔：tip 为笔尖位置，ang 为笔杆方向（指向握笔处）
export function drawBrushTool(ctx, tip, ang, s, a = 1) {
  ctx.save();
  ctx.translate(tip[0], tip[1]);
  ctx.rotate(ang);
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = 'source-over';
  // 笔头
  ctx.fillStyle = rgba(inkRGB(0.95), 1);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(s * 0.08, -s * 0.06, s * 0.26, -s * 0.05);
  ctx.lineTo(s * 0.26, s * 0.05);
  ctx.quadraticCurveTo(s * 0.08, s * 0.06, 0, 0);
  ctx.fill();
  // 笔杆
  ctx.fillStyle = rgba(C.bamboo, 1);
  ctx.fillRect(s * 0.25, -s * 0.035, s * 0.75, s * 0.07);
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = rgba(inkRGB(0.7), 0.9);
  ctx.lineWidth = s * 0.008;
  ctx.strokeRect(s * 0.25, -s * 0.035, s * 0.75, s * 0.07);
  for (const q of [0.45, 0.7, 0.92]) {
    ctx.beginPath();
    ctx.moveTo(s * q, -s * 0.035);
    ctx.lineTo(s * q, s * 0.035);
    ctx.stroke();
  }
  ctx.restore();
}

// 从画面外伸进来的手臂（袖子 + 手）：from 为画面外的肘部方向，hand 为手心
// v2：改用近景手（closeup.drawHand），拇指朝上；o.curl 手指弯曲、o.kind 'old'|'adult'|'child'
export function drawArmIn(ctx, from, hand, w, sleeve, a = 1, o = {}) {
  const dx = hand[0] - from[0], dy = hand[1] - from[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  const ang = Math.atan2(uy, ux);
  const s = w * 1.05;
  const wrist = [hand[0] - ux * s * 0.5, hand[1] - uy * s * 0.5];
  const kind = o.kind || (sleeve[0] < 120 ? 'old' : 'adult');
  // 拇指（局部 -y）朝画面上方
  const mirror = -Math.cos(ang) > 0;
  drawHandCU(ctx, {
    x: wrist[0], y: wrist[1], ang, s, kind, view: 'back',
    curl: o.curl ?? 0.55, thumb: o.thumb ?? 0.4, thumbA: o.thumbA ?? -0.6, mirror,
    sleeve, cuff: sleeve.map((v) => Math.min(255, v + 40)), sleeveLen: L + 2400, sleeveW: w * 1.25, alpha: a, seed: o.seed ?? 3,
  });
}

// 山脚的老式客车
export function drawBus(ctx, x, y, s, a = 1, t = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = rgba([188, 196, 184], 1);
  ctx.beginPath();
  ctx.roundRect(-40, -30, 80, 24, 6);
  ctx.fill();
  ctx.fillStyle = rgba([150, 160, 150], 1);
  ctx.fillRect(-40, -12, 80, 6);
  ctx.fillStyle = rgba(inkRGB(0.6), 1);
  for (let k = 0; k < 6; k++) ctx.fillRect(-34 + k * 11, -26, 8, 8);
  ctx.fillStyle = rgba(inkRGB(0.95), 1);
  for (const wx of [-24, 24]) {
    ctx.beginPath();
    ctx.arc(wx, -5, 5.5, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'multiply';
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = rgba(inkRGB(0.85), 0.9);
  ctx.beginPath();
  ctx.roundRect(-40, -30, 80, 24, 6);
  ctx.stroke();
  ctx.restore();
}

// 车后扬起的尘土
export function dust(ctx, x, y, t, amt = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let k = 0; k < 8; k++) {
    const age = (t * 0.8 + k / 8) % 1;
    softDot(ctx, x + age * 60 + k * 3, y - age * 14, 8 + age * 26, [200, 188, 166], 0.3 * (1 - age) * amt, 0.6);
  }
  ctx.restore();
}

export { Camera, applyCamera };
