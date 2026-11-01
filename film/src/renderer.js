// 渲染器：按时间轴画出一帧（含转场），再交给 WebGL 后期。
// v2：每个镜头画四层——背景（不透明）、背景白粉、前景（人物与道具，透明）、前景白粉。
// 镜头里的 ctx 是背景层；ctx.fg 是前景层（用 brush.js 的 fgOf(ctx) 取用，会同步变换）；
// 两层各自的 .white 是对应的白粉层；前景层的 .bg 指回背景层（人物在背景上画接触影）。
import { POST_DEFAULTS, Post } from './ink/post.js';
import { makePaper } from './ink/paper.js';
import { mixv, Ease } from './core/math.js';
import { VW } from './core/camera.js';
import { makeCanvas } from './core/canvas.js';

const TYPE = { cut: 0, cross: 1, ink: 2, paper: 3 };

function layers(W, H) {
  return [makeCanvas(W, H), makeCanvas(W, H), makeCanvas(W, H), makeCanvas(W, H)];
}

function reset(c, W, H, fill) {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.filter = 'none';
  if (fill) {
    c.fillStyle = fill;
    c.fillRect(0, 0, W, H);
  } else c.clearRect(0, 0, W, H);
}

export class Renderer {
  constructor(out, W, H) {
    this.W = W; this.H = H;
    this.base = W / VW;
    this.LA = layers(W, H);
    this.LB = layers(W, H);
    this.post = new Post(out, W, H);
    const { paper, fiber } = makePaper(W, H);
    this.post.setPaper(paper, fiber);
  }
  drawShot(shot, lt, L, frame) {
    const [bg, bgW, fg, fgW] = L.map((c) => c.ctx);
    reset(bg, this.W, this.H, '#fff');
    reset(bgW, this.W, this.H);
    reset(fg, this.W, this.H);
    reset(fgW, this.W, this.H);
    bg.white = bgW;
    bg.fg = fg;
    fg.white = fgW;
    fg.bg = bg;
    fg.fg = fg;
    for (const c of [bg, bgW, fg, fgW]) {
      c.setTransform(this.base, 0, 0, this.base, 0, 0);
      c.base = this.base;
    }
    const R = { base: this.base, frame, W: this.W, H: this.H, boil: Math.floor(frame / 2) };
    bg.save();
    shot.render(bg, lt, R);
    bg.restore();
  }
  postOf(shot, lt) {
    const p = typeof shot.post === 'function' ? shot.post(lt) : shot.post || {};
    return { ...POST_DEFAULTS, ...p };
  }
  renderAt(state, frame) {
    this.drawShot(state.a.shot, state.a.lt, this.LA, frame);
    let P = this.postOf(state.a.shot, state.a.lt);
    let mix = null;
    if (state.b) {
      this.drawShot(state.b.shot, state.b.lt, this.LB, frame);
      const PB = this.postOf(state.b.shot, state.b.lt);
      P = mixv(P, PB, Ease.inOutSine(Math.min(1, Math.max(0, state.mix.p))));
      mix = { type: TYPE[state.mix.type] ?? 1, p: state.mix.p, seed: state.mix.seed };
    }
    const seed = (Math.floor(frame / 2) * 0.731) % 97;
    this.post.render(this.LA, state.b ? this.LB : null, mix, P, seed);
  }
}
