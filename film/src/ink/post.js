// WebGL2 后期：转场混合 → 半分辨率模糊 → 水墨合成（洇墨、湿边、浓淡、宣纸、暗角、颗粒）
export const POST_DEFAULTS = {
  wobble: 1.0,     // 边缘晃动幅度（虚拟像素）
  bleed: 0.55,     // 洇墨
  blurRadius: 2.0, // 洇墨/湿边用的模糊半径（半分辨率纹素）
  edge: 0.35,      // 湿边加深
  gran: 0.10,      // 颜料浓淡起伏
  grain: 0.010,    // 防色带颗粒
  vig: 0.55,       // 暗角
  sat: 1.0,        // 饱和度
  redKeep: 1.0,    // 去色时保留朱红
  sepia: 0.0,      // 旧黄（闪回）
  fade: 0.0,       // 化入留白
  tint: [1, 1, 1], // 整体色调（乘）
};

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const COMMON = `#version 300 es
precision highp float;
in vec2 vUv;
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec2 mod289(vec2 x){return x - floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*snoise(p); p=p*2.03+vec2(17.1,9.2); a*=0.5;} return s; }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

const MIX_FS = COMMON + `
layout(location=0) out vec4 o;
layout(location=1) out vec4 o1;
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uWA;
uniform sampler2D uWB;
uniform sampler2D uNoise;
uniform float uP;
uniform int uType;
uniform vec2 uVRes;
uniform float uSeed;
float tfbm(vec2 p){
  // 三个八度的平铺噪声纹理，p 为虚拟像素坐标
  vec2 q = p * 0.00013 + uSeed * 0.137;
  return (texture(uNoise, q).r - 0.5) * 1.1 + (texture(uNoise, q * 2.07 + 0.31).g - 0.5) * 0.55 + (texture(uNoise, q * 4.13 + 0.77).b - 0.5) * 0.28;
}
void main(){
  vec3 a = texture(uA, vUv).rgb;
  float wa = texture(uWA, vUv).a;
  if (uType == 0) { o = vec4(a, 1.0); o1 = vec4(wa, wa, wa, 1.0); return; }
  vec3 b = texture(uB, vUv).rgb;
  float wb = texture(uWB, vUv).a;
  vec2 p = vUv * uVRes;
  vec3 c;
  float wm;
  if (uType == 1) {
    float m = smoothstep(0.0, 1.0, uP);
    c = mix(a, b, m);
    wm = mix(wa, wb, m);
  } else if (uType == 2) {
    // 墨晕转场：新画面像墨一样一团团洇开
    float n = tfbm(p) * 0.9 + 0.5;
    n = mix(n, length(vUv - 0.5) * 1.25, 0.3);
    float th = uP * 1.36 - 0.18;
    float w = 0.06;
    float m = smoothstep(n - w, n + w, th);
    float rim = exp(-pow((th - n) / w, 2.0));
    c = mix(a, b, m) * (1.0 - 0.10 * rim);
    wm = mix(wa, wb, m);
  } else {
    // 化入留白再化出
    float n = tfbm(p * 1.4) * 0.2;
    float m1 = smoothstep(0.0, 0.55, uP + n);
    float m2 = smoothstep(0.45, 1.0, uP + n);
    c = mix(mix(a, vec3(1.0), m1), b, m2);
    wm = mix(wa * (1.0 - m1), wb, m2);
  }
  o = vec4(c, 1.0);
  o1 = vec4(wm, wm, wm, 1.0);
}`;

const BLUR_FS = COMMON + `
out vec4 o;
uniform sampler2D uT;
uniform vec2 uDir;
void main(){
  vec3 s = texture(uT, vUv).rgb * 0.2270270270;
  s += texture(uT, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture(uT, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture(uT, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  s += texture(uT, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  o = vec4(s, 1.0);
}`;

const FINAL_FS = COMMON + `
out vec4 o;
uniform sampler2D uScene;
uniform sampler2D uWhite;
uniform sampler2D uBlur;
uniform sampler2D uPaper;
uniform sampler2D uFiber;
uniform sampler2D uNoise;
uniform vec2 uVRes;
uniform float uSeed, uWobble, uBleed, uEdge, uGran, uGrain, uVig, uSat, uRedKeep, uSepia, uFade;
uniform vec3 uTint;
void main(){
  vec2 p = vUv * uVRes;
  vec2 sd = vec2(fract(uSeed * 0.6180339), fract(uSeed * 0.4142135));
  vec4 n1 = texture(uNoise, p * 0.000625 + sd);
  vec4 n2 = texture(uNoise, p * 0.0028 + sd.yx + 0.5);
  vec2 d = ((n1.rg - 0.5) * 2.0 + (n2.rg - 0.5) * 0.9) * uWobble;
  vec2 uv = vUv + d / uVRes;
  vec3 s = texture(uScene, uv).rgb;
  vec3 b = texture(uBlur, uv).rgb;
  float fib = texture(uFiber, vUv).r;
  // 洇墨：沿纸纤维向外渗
  vec3 c = mix(s, min(s, b), uBleed * (0.3 + 0.7 * fib));
  // 湿边：墨块边缘略深
  c -= max(b - s, 0.0) * uEdge;
  // 颜料浓淡（纸面吸墨不均）
  float g = (texture(uNoise, p * 0.0131).b - 0.5) * 1.6 + (texture(uNoise, p * 0.0027 + 0.37).a - 0.5) * 1.4;
  float dens = 1.0 + g * uGran;
  c = clamp(c - (c - c * c) * (dens - 1.0), 0.0, 1.0);
  // 调色：去色时保留朱红
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float red = clamp((c.r - max(c.g, c.b)) * 3.0, 0.0, 1.0);
  vec3 cs = mix(vec3(l), c, uSat);
  c = mix(cs, c, red * uRedKeep * step(uSat, 0.999));
  vec3 sep = vec3(1.0) - (1.0 - l) * vec3(0.80, 0.88, 1.0);
  c = mix(c, sep, uSepia);
  // 乘宣纸
  vec3 paper = texture(uPaper, vUv).rgb;
  vec3 col = c * paper * uTint;
  // 白粉（雪、梨花等比纸更白的颜料）
  float wp = clamp(texture(uWhite, uv).r, 0.0, 1.0) * (0.9 + 0.1 * fib);
  vec3 pig = vec3(0.995, 0.99, 0.975) * (0.965 + 0.035 * paper.r) * uTint;
  col = mix(col, pig, wp * 0.94);
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
    this.texA = this.tex();
    this.texB = this.tex();
    this.texWA = this.tex();
    this.texWB = this.tex();
    this.texPaper = this.tex();
    this.texFiber = this.tex();
    this.texNoise = this.noiseTex(512, 16);
    this.fMix = this.fbo(W, H, 2);
    const hw = Math.max(1, Math.round(W / 2)), hh = Math.max(1, Math.round(H / 2));
    this.fH = this.fbo(hw, hh);
    this.fV = this.fbo(hw, hh);
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
  // 可平铺的值噪声纹理（四个通道互相独立），代替着色器里昂贵的程序噪声
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
    return { f, t: ts[0], t1: ts[1], w, h };
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
  // sceneA/sceneB: 画布；mix: {type:0..3, p}；P: 后期参数；seed: 每两帧变一次
  render(sceneA, sceneB, mix, P, seed, whiteA, whiteB) {
    const gl = this.gl;
    const VRES = [1920, 1080];
    this.upload(this.texA, sceneA);
    this.upload(this.texWA, whiteA);
    const type = sceneB && mix ? mix.type : 0;
    if (type) { this.upload(this.texB, sceneB); this.upload(this.texWB, whiteB); }
    // 1) 转场混合
    let pr = this.progMix;
    gl.useProgram(pr.p);
    this.bind(0, this.texA); gl.uniform1i(pr.u.uA, 0);
    this.bind(1, type ? this.texB : this.texA); gl.uniform1i(pr.u.uB, 1);
    gl.uniform1f(pr.u.uP, mix ? mix.p : 0);
    gl.uniform1i(pr.u.uType, type);
    gl.uniform2f(pr.u.uVRes, VRES[0], VRES[1]);
    gl.uniform1f(pr.u.uSeed, (mix && mix.seed) || 3.0);
    this.bind(2, this.texNoise); gl.uniform1i(pr.u.uNoise, 2);
    this.bind(3, this.texWA); gl.uniform1i(pr.u.uWA, 3);
    this.bind(4, type ? this.texWB : this.texWA); gl.uniform1i(pr.u.uWB, 4);
    this.draw(this.fMix);
    // 2) 模糊
    const r = P.blurRadius;
    pr = this.progBlur;
    gl.useProgram(pr.p);
    this.bind(0, this.fMix.t); gl.uniform1i(pr.u.uT, 0);
    gl.uniform2f(pr.u.uDir, r / this.hw, 0);
    this.draw(this.fH);
    this.bind(0, this.fH.t);
    gl.uniform2f(pr.u.uDir, 0, r / this.hh);
    this.draw(this.fV);
    // 3) 合成
    pr = this.progFinal;
    gl.useProgram(pr.p);
    this.bind(0, this.fMix.t); gl.uniform1i(pr.u.uScene, 0);
    this.bind(1, this.fV.t); gl.uniform1i(pr.u.uBlur, 1);
    this.bind(2, this.texPaper); gl.uniform1i(pr.u.uPaper, 2);
    this.bind(3, this.texFiber); gl.uniform1i(pr.u.uFiber, 3);
    this.bind(4, this.texNoise); gl.uniform1i(pr.u.uNoise, 4);
    this.bind(5, this.fMix.t1); gl.uniform1i(pr.u.uWhite, 5);
    gl.uniform2f(pr.u.uVRes, VRES[0], VRES[1]);
    gl.uniform1f(pr.u.uSeed, seed);
    gl.uniform1f(pr.u.uWobble, P.wobble);
    gl.uniform1f(pr.u.uBleed, P.bleed);
    gl.uniform1f(pr.u.uEdge, P.edge);
    gl.uniform1f(pr.u.uGran, P.gran);
    gl.uniform1f(pr.u.uGrain, P.grain);
    gl.uniform1f(pr.u.uVig, P.vig);
    gl.uniform1f(pr.u.uSat, P.sat);
    gl.uniform1f(pr.u.uRedKeep, P.redKeep);
    gl.uniform1f(pr.u.uSepia, P.sepia);
    gl.uniform1f(pr.u.uFade, P.fade);
    gl.uniform3f(pr.u.uTint, P.tint[0], P.tint[1], P.tint[2]);
    this.draw(null);
  }
}
