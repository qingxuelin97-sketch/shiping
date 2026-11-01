// WebGL2 后期（v2，前后景分层）：
//   每个镜头有四层：背景（不透明）、背景白粉、前景（透明，人物与道具）、前景白粉。
//   1) 转场混合：A/B 两个镜头的各层混合 → 三个输出（背景+背景白粉在 alpha、前景预乘、前景白粉）
//   2) 半分辨率模糊：洇墨/湿边用的小模糊；景深用的大模糊（只在需要时做）
//   3) 合成：背景（固定的边缘晃动，不再“抖”）→ 乘宣纸 → 背景白粉 → 前景（手绘线条的呼吸）→ 前景白粉 → 暗角、颗粒
export const POST_DEFAULTS = {
  wobble: 1.0,     // 背景边缘晃动幅度（虚拟像素，静止）
  fgWobble: 0.85,  // 前景线条呼吸幅度（每两帧变化）
  bleed: 0.55,     // 洇墨
  blurRadius: 2.0, // 洇墨/湿边用的模糊半径（半分辨率纹素）
  edge: 0.35,      // 湿边加深
  gran: 0.10,      // 颜料浓淡起伏
  grain: 0.010,    // 防色带颗粒（静态）
  vig: 0.55,       // 暗角
  sat: 1.0,        // 饱和度
  redKeep: 1.0,    // 去色时保留朱红
  sepia: 0.0,      // 旧黄（闪回）
  fade: 0.0,       // 化入留白
  dof: 0.0,        // 景深：背景虚化程度 0..1
  dofRadius: 3.2,  // 景深模糊半径（半分辨率纹素）
  tint: [1, 1, 1], // 整体色调（乘）
  fgTint: [1, 1, 1], // 前景额外色调（如夕阳下的暖光）
};

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const COMMON = `#version 300 es
precision highp float;
in vec2 vUv;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

const MIX_FS = COMMON + `
layout(location=0) out vec4 oBg;
layout(location=1) out vec4 oFg;
layout(location=2) out vec4 oFgW;
uniform sampler2D uA;
uniform sampler2D uWA;
uniform sampler2D uFA;
uniform sampler2D uGA;
uniform sampler2D uB;
uniform sampler2D uWB;
uniform sampler2D uFB;
uniform sampler2D uGB;
uniform sampler2D uNoise;
uniform float uP;
uniform int uType;
uniform vec2 uVRes;
uniform float uSeed;
float tfbm(vec2 p){
  vec2 q = p * 0.00013 + uSeed * 0.137;
  return (texture(uNoise, q).r - 0.5) * 1.1 + (texture(uNoise, q * 2.07 + 0.31).g - 0.5) * 0.55 + (texture(uNoise, q * 4.13 + 0.77).b - 0.5) * 0.28;
}
vec4 pm(vec4 c){ return vec4(c.rgb * c.a, c.a); }
void main(){
  vec4 a = vec4(texture(uA, vUv).rgb, texture(uWA, vUv).a);
  vec4 fa = pm(texture(uFA, vUv));
  float ga = texture(uGA, vUv).a;
  if (uType == 0) { oBg = a; oFg = fa; oFgW = vec4(ga); return; }
  vec4 b = vec4(texture(uB, vUv).rgb, texture(uWB, vUv).a);
  vec4 fb = pm(texture(uFB, vUv));
  float gb = texture(uGB, vUv).a;
  vec2 p = vUv * uVRes;
  if (uType == 1) {
    float m = smoothstep(0.0, 1.0, uP);
    oBg = mix(a, b, m); oFg = mix(fa, fb, m); oFgW = vec4(mix(ga, gb, m));
  } else if (uType == 2) {
    // 墨晕转场：新画面像墨一样一团团洇开
    float n = tfbm(p) * 0.9 + 0.5;
    n = mix(n, length(vUv - 0.5) * 1.25, 0.3);
    float th = uP * 1.36 - 0.18;
    float w = 0.06;
    float m = smoothstep(n - w, n + w, th);
    float rim = exp(-pow((th - n) / w, 2.0));
    oBg = mix(a, b, m);
    oBg.rgb *= (1.0 - 0.10 * rim);
    oFg = mix(fa, fb, m); oFgW = vec4(mix(ga, gb, m));
  } else {
    // 化入留白再化出
    float n = tfbm(p * 1.4) * 0.2;
    float m1 = smoothstep(0.0, 0.55, uP + n);
    float m2 = smoothstep(0.45, 1.0, uP + n);
    vec4 aw = vec4(mix(a.rgb, vec3(1.0), m1), a.a * (1.0 - m1));
    oBg = mix(aw, b, m2);
    oFg = mix(fa * (1.0 - m1), fb, m2);
    oFgW = vec4(mix(ga * (1.0 - m1), gb, m2));
  }
}`;

const BLUR_FS = COMMON + `
out vec4 o;
uniform sampler2D uT;
uniform vec2 uDir;
void main(){
  vec4 s = texture(uT, vUv) * 0.2270270270;
  s += texture(uT, vUv + uDir * 1.3846153846) * 0.3162162162;
  s += texture(uT, vUv - uDir * 1.3846153846) * 0.3162162162;
  s += texture(uT, vUv + uDir * 3.2307692308) * 0.0702702703;
  s += texture(uT, vUv - uDir * 3.2307692308) * 0.0702702703;
  o = s;
}`;

const FINAL_FS = COMMON + `
out vec4 o;
uniform sampler2D uBg;
uniform sampler2D uBlur;
uniform sampler2D uDofTex;
uniform sampler2D uFg;
uniform sampler2D uFgW;
uniform sampler2D uPaper;
uniform sampler2D uFiber;
uniform sampler2D uNoise;
uniform vec2 uVRes;
uniform float uSeed, uBgSeed, uWobble, uFgWobble, uBleed, uEdge, uGran, uGrain, uVig, uSat, uRedKeep, uSepia, uFade, uDof;
uniform vec3 uTint, uFgTint;
vec2 wob(vec2 p, float seed, float amp){
  vec2 sd = vec2(fract(seed * 0.6180339), fract(seed * 0.4142135));
  vec4 n1 = texture(uNoise, p * 0.000625 + sd);
  vec4 n2 = texture(uNoise, p * 0.0028 + sd.yx + 0.5);
  return ((n1.rg - 0.5) * 2.0 + (n2.rg - 0.5) * 0.9) * amp;
}
vec3 granulate(vec3 c, vec2 p, float amt){
  float g = (texture(uNoise, p * 0.0131).b - 0.5) * 1.6 + (texture(uNoise, p * 0.0027 + 0.37).a - 0.5) * 1.4;
  float dens = 1.0 + g * amt;
  return clamp(c - (c - c * c) * (dens - 1.0), 0.0, 1.0);
}
vec3 grade(vec3 c){
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float red = clamp((c.r - max(c.g, c.b)) * 3.0, 0.0, 1.0);
  vec3 cs = mix(vec3(l), c, uSat);
  c = mix(cs, c, red * uRedKeep * step(uSat, 0.999));
  vec3 sep = vec3(1.0) - (1.0 - l) * vec3(0.80, 0.88, 1.0);
  return mix(c, sep, uSepia);
}
void main(){
  vec2 p = vUv * uVRes;
  float fib = texture(uFiber, vUv).r;
  vec3 paper = texture(uPaper, vUv).rgb;
  vec3 pig = vec3(0.995, 0.99, 0.975) * (0.965 + 0.035 * paper.r) * uTint;
  // ---- 背景：边缘晃动固定，不随时间抖 ----
  vec2 uvb = vUv + wob(p, uBgSeed, uWobble) / uVRes;
  vec4 s4 = texture(uBg, uvb);
  vec4 b4 = texture(uBlur, uvb);
  vec3 c = mix(s4.rgb, min(s4.rgb, b4.rgb), uBleed * (0.3 + 0.7 * fib));
  c -= max(b4.rgb - s4.rgb, 0.0) * uEdge;
  float wbg = s4.a;
  if (uDof > 0.001) {
    vec4 d4 = texture(uDofTex, uvb);
    c = mix(c, d4.rgb, uDof);
    wbg = mix(wbg, d4.a, uDof);
  }
  c = grade(granulate(c, p, uGran));
  vec3 col = c * paper * uTint;
  col = mix(col, pig, clamp(wbg, 0.0, 1.0) * (0.9 + 0.1 * fib) * 0.94);
  // ---- 前景：人物与道具，线条按两帧一变“呼吸” ----
  vec2 uvf = vUv + wob(p, uSeed, uFgWobble) / uVRes;
  vec4 f = texture(uFg, uvf);
  if (f.a > 0.002) {
    vec3 fc = f.rgb / f.a;
    fc = grade(granulate(fc, p, uGran * 0.6));
    col = mix(col, fc * paper * uTint * uFgTint, clamp(f.a, 0.0, 1.0));
  }
  float wfg = texture(uFgW, uvf).r;
  col = mix(col, pig, clamp(wfg, 0.0, 1.0) * 0.94);
  col = mix(col, paper * uTint, uFade);
  // 暗角（偏暖）
  vec2 q = (vUv - 0.5) * vec2(1.0, 0.82);
  float v = smoothstep(0.30, 0.80, length(q));
  col *= mix(vec3(1.0), vec3(0.82, 0.76, 0.68), v * uVig);
  col += (hash12(gl_FragCoord.xy) - 0.5) * uGrain;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class Post {
  constructor(canvas, W, H) {
    this.W = W; this.H = H;
    canvas.width = W; canvas.height = H;
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 不可用');
    this.gl = gl;
    this.progMix = this.program(MIX_FS);
    this.progBlur = this.program(BLUR_FS);
    this.progFinal = this.program(FINAL_FS);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // 每一侧 4 层：背景、背景白粉、前景、前景白粉
    this.tA = [this.tex(), this.tex(), this.tex(), this.tex()];
    this.tB = [this.tex(), this.tex(), this.tex(), this.tex()];
    this.texPaper = this.tex();
    this.texFiber = this.tex();
    this.texNoise = this.noiseTex(512, 16);
    this.fMix = this.fbo(W, H, 3);
    const hw = Math.max(1, Math.round(W / 2)), hh = Math.max(1, Math.round(H / 2));
    this.fH = this.fbo(hw, hh);
    this.fV = this.fbo(hw, hh);
    this.fDH = this.fbo(hw, hh);
    this.fDV = this.fbo(hw, hh);
    this.hw = hw; this.hh = hh;
  }
  program(fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }
  tex() {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  // 可平铺的值噪声纹理（四个通道互相独立）
  noiseTex(N, cells) {
    const gl = this.gl;
    const data = new Uint8Array(N * N * 4);
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let ch = 0; ch < 4; ch++) {
      const C = ch < 2 ? cells : cells * 2;
      const lat = new Float32Array(C * C);
      for (let i = 0; i < lat.length; i++) lat[i] = rnd();
      const sm = (t) => t * t * (3 - 2 * t);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const fx = (x / N) * C, fy = (y / N) * C;
          const ix = Math.floor(fx), iy = Math.floor(fy);
          const tx = sm(fx - ix), ty = sm(fy - iy);
          const a = lat[(iy % C) * C + (ix % C)], b = lat[(iy % C) * C + ((ix + 1) % C)];
          const c = lat[((iy + 1) % C) * C + (ix % C)], d = lat[((iy + 1) % C) * C + ((ix + 1) % C)];
          const v = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
          data[(y * N + x) * 4 + ch] = Math.round(v * 255);
        }
      }
    }
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
  }
  fbo(w, h, n = 1) {
    const gl = this.gl;
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    const ts = [];
    for (let i = 0; i < n; i++) {
      const t = this.tex();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      ts.push(t);
    }
    if (n > 1) gl.drawBuffers(ts.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { f, t: ts[0], ts, w, h };
  }
  upload(t, src) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }
  setPaper(paper, fiber) {
    this.upload(this.texPaper, paper);
    this.upload(this.texFiber, fiber);
  }
  bind(unit, t) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
  }
  draw(target) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null);
    gl.viewport(0, 0, target ? target.w : this.W, target ? target.h : this.H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  blur(src, mid, dst, r) {
    const gl = this.gl;
    const pr = this.progBlur;
    gl.useProgram(pr.p);
    this.bind(0, src); gl.uniform1i(pr.u.uT, 0);
    gl.uniform2f(pr.u.uDir, r / this.hw, 0);
    this.draw(mid);
    this.bind(0, mid.t);
    gl.uniform2f(pr.u.uDir, 0, r / this.hh);
    this.draw(dst);
  }
  // layersA/B: [背景, 背景白粉, 前景, 前景白粉] 四块画布；mix: {type, p, seed}；P: 后期参数；seed: 前景呼吸种子
  render(layersA, layersB, mix, P, seed) {
    const gl = this.gl;
    const VRES = [1920, 1080];
    layersA.forEach((c, i) => this.upload(this.tA[i], c));
    const type = layersB && mix ? mix.type : 0;
    if (type) layersB.forEach((c, i) => this.upload(this.tB[i], c));
    const TB = type ? this.tB : this.tA;
    // 1) 转场混合
    let pr = this.progMix;
    gl.useProgram(pr.p);
    const names = ['uA', 'uWA', 'uFA', 'uGA', 'uB', 'uWB', 'uFB', 'uGB'];
    [...this.tA, ...TB].forEach((t, i) => { this.bind(i, t); gl.uniform1i(pr.u[names[i]], i); });
    this.bind(8, this.texNoise); gl.uniform1i(pr.u.uNoise, 8);
    gl.uniform1f(pr.u.uP, mix ? mix.p : 0);
    gl.uniform1i(pr.u.uType, type);
    gl.uniform2f(pr.u.uVRes, VRES[0], VRES[1]);
    gl.uniform1f(pr.u.uSeed, (mix && mix.seed) || 3.0);
    this.draw(this.fMix);
    // 2) 模糊：洇墨用的小模糊；景深用的大模糊
    this.blur(this.fMix.ts[0], this.fH, this.fV, P.blurRadius);
    const useDof = P.dof > 0.001;
    if (useDof) this.blur(this.fMix.ts[0], this.fDH, this.fDV, P.dofRadius);
    // 3) 合成
    pr = this.progFinal;
    gl.useProgram(pr.p);
    this.bind(0, this.fMix.ts[0]); gl.uniform1i(pr.u.uBg, 0);
    this.bind(1, this.fV.t); gl.uniform1i(pr.u.uBlur, 1);
    this.bind(2, useDof ? this.fDV.t : this.fV.t); gl.uniform1i(pr.u.uDofTex, 2);
    this.bind(3, this.fMix.ts[1]); gl.uniform1i(pr.u.uFg, 3);
    this.bind(4, this.fMix.ts[2]); gl.uniform1i(pr.u.uFgW, 4);
    this.bind(5, this.texPaper); gl.uniform1i(pr.u.uPaper, 5);
    this.bind(6, this.texFiber); gl.uniform1i(pr.u.uFiber, 6);
    this.bind(7, this.texNoise); gl.uniform1i(pr.u.uNoise, 7);
    gl.uniform2f(pr.u.uVRes, VRES[0], VRES[1]);
    gl.uniform1f(pr.u.uSeed, seed);
    gl.uniform1f(pr.u.uBgSeed, 7.31);
    gl.uniform1f(pr.u.uWobble, P.wobble);
    gl.uniform1f(pr.u.uFgWobble, P.fgWobble);
    gl.uniform1f(pr.u.uBleed, P.bleed);
    gl.uniform1f(pr.u.uEdge, P.edge);
    gl.uniform1f(pr.u.uGran, P.gran);
    gl.uniform1f(pr.u.uGrain, P.grain);
    gl.uniform1f(pr.u.uVig, P.vig);
    gl.uniform1f(pr.u.uSat, P.sat);
    gl.uniform1f(pr.u.uRedKeep, P.redKeep);
    gl.uniform1f(pr.u.uSepia, P.sepia);
    gl.uniform1f(pr.u.uFade, P.fade);
    gl.uniform1f(pr.u.uDof, useDof ? P.dof : 0);
    gl.uniform3f(pr.u.uTint, P.tint[0], P.tint[1], P.tint[2]);
    gl.uniform3f(pr.u.uFgTint, P.fgTint[0], P.fgTint[1], P.fgTint[2]);
    this.draw(null);
  }
}
