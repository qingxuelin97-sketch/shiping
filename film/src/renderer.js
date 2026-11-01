// 渲染器：按时间轴画出一帧（含转场），再交给 WebGL 后期
import { POST_DEFAULTS, Post } from './ink/post.js';
import { makePaper } from './ink/paper.js';
import { mixv, Ease } from './core/math.js';
import { VW } from './core/camera.js';
import { makeCanvas } from './core/canvas.js';

const TYPE = { cut: 0, cross: 1, ink: 2, paper: 3 };

const canvas = makeCanvas;

export class Renderer {
  constructor(out, W, H) {
    this.W = W; this.H = H;
    this.base = W / VW;
    this.cA = canvas(W, H);
    this.cB = canvas(W, H);
    this.wA = canvas(W, H);
    this.wB = canvas(W, H);
    this.post = new Post(out, W, H);
    const { paper, fiber } = makePaper(W, H);
    this.post.setPaper(paper, fiber);
  }
  drawShot(shot, lt, cv, frame, wv) {
    const w = wv.ctx;
    w.setTransform(1, 0, 0, 1, 0, 0);
    w.globalAlpha = 1;
    w.globalCompositeOperation = 'source-over';
    w.filter = 'none';
    w.clearRect(0, 0, this.W, this.H);
    const ctx = cv.ctx;
    ctx.white = w;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.setTransform(this.base, 0, 0, this.base, 0, 0);
    const R = { base: this.base, frame, W: this.W, H: this.H, boil: Math.floor(frame / 2) };
    ctx.save();
    shot.render(ctx, lt, R);
    ctx.restore();
  }
  postOf(shot, lt) {
    const p = typeof shot.post === 'function' ? shot.post(lt) : shot.post || {};
    return { ...POST_DEFAULTS, ...p };
  }
  renderAt(state, frame) {
    this.drawShot(state.a.shot, state.a.lt, this.cA, frame, this.wA);
    let P = this.postOf(state.a.shot, state.a.lt);
    let mix = null;
    if (state.b) {
      this.drawShot(state.b.shot, state.b.lt, this.cB, frame, this.wB);
      const PB = this.postOf(state.b.shot, state.b.lt);
      P = mixv(P, PB, Ease.inOutSine(Math.min(1, Math.max(0, state.mix.p))));
      mix = { type: TYPE[state.mix.type] ?? 1, p: state.mix.p, seed: state.mix.seed };
    }
    const seed = (Math.floor(frame / 2) * 0.731) % 97;
    this.post.render(this.cA, state.b ? this.cB : null, mix, P, seed, this.wA, this.wB);
  }
}
