// 入口：在页面上暴露 window.FILM，供渲染脚本逐帧调用
import { Renderer } from './renderer.js';
import { TIMELINE, DEV } from './timeline.js';
import { FPS } from './core/timeline.js';

const FONTS = [
  '64px MaShanZheng',
  '64px ZhiMangXing',
  '64px ZCOOLXiaoWei',
  '64px Cormorant',
  'italic 64px Cormorant',
];

const q = new URLSearchParams(location.search);
const W = parseInt(q.get('w') || '1920', 10);
const H = Math.round((W * 9) / 16);
const out = document.getElementById('out');
const FILM = (window.FILM = { isReady: false, fps: FPS, width: W, height: H });

(async () => {
  await Promise.all(FONTS.map((f) => document.fonts.load(f, '纸鸢 The Paper Kite')));
  const R = new Renderer(out, W, H);
  FILM.duration = TIMELINE.duration;
  FILM.frames = Math.round(TIMELINE.duration * FPS);
  FILM.shots = TIMELINE.shots.map((s) => ({ id: s.id, start: s.start, dur: s.dur }));
  FILM.draw = (n) => R.renderAt(TIMELINE.at(n / FPS), n);
  FILM.renderFrame = (n) => {
    R.renderAt(TIMELINE.at(n / FPS), n);
    return out.toDataURL('image/png').slice(22);
  };
  FILM.renderShot = (id, lt) => {
    const s = TIMELINE.find(id) || (DEV[id] && { shot: DEV[id], start: 0 });
    if (!s) throw new Error('没有镜头 ' + id);
    R.renderAt({ a: { shot: s.shot, lt } }, Math.round((s.start + lt) * FPS));
    return out.toDataURL('image/png').slice(22);
  };
  FILM.getCues = () => TIMELINE.cues();
  // 成片渲染：读回原始像素（自下而上），用 POST 发给本地服务器，避免 PNG 编码和 CDP 传输
  let px = null;
  FILM.renderPost = async (n, k) => {
    R.renderAt(TIMELINE.at(n / FPS), n);
    const gl = R.post.gl;
    if (!px) px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const r = await fetch(`/frame?k=${k}&n=${n}`, { method: 'POST', body: px });
    if (!r.ok) throw new Error('frame upload failed: ' + (await r.text()));
    return true;
  };
  FILM.isReady = true;
})().catch((e) => {
  FILM.error = String((e && e.stack) || e);
  console.error(FILM.error);
});
