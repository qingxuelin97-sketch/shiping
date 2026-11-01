// 多进程渲染整片或片段 → ffmpeg 分段编码 → 无损拼接
// node render/render.mjs                      成片 1920×1080 24fps → build/video.mp4
// node render/render.mjs --preview            样片 960×540 12fps → build/preview.mp4
// node render/render.mjs --from 40 --to 60    只渲染一段
// 可选：--workers 4 --crf 18 --out build/x.mp4 --w 1280
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, startServer, launch, openFilm, parseArgs } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const preview = !!args.preview;
const W = parseInt(args.w || (preview ? '960' : '1920'), 10);
const H = Math.round((W * 9) / 16);
const WORKERS = parseInt(args.workers || '4', 10);
const CRF = String(args.crf || (preview ? '23' : '17'));
const step = preview ? 2 : 1; // 样片隔帧渲染 → 12fps
const out = path.resolve(ROOT, args.out || (preview ? 'build/preview.mp4' : 'build/video.mp4'));
const segDir = path.join(path.dirname(out), path.basename(out, '.mp4') + '_segs');
fs.mkdirSync(segDir, { recursive: true });

const encoders = {};
const srv = await startServer(async (q, buf) => {
  const e = encoders[q.k];
  if (!e) throw new Error('no encoder ' + q.k);
  if (buf.length !== W * H * 4) throw new Error(`bad frame size ${buf.length}`);
  if (!e.stdin.write(buf)) await new Promise((r) => e.stdin.once('drain', r));
  e.count++;
});
const port = srv.address().port;

// 先开一个页面拿总时长
const probe = await launch();
const pg = await openFilm(probe, port, 320);
const info = await pg.evaluate(() => ({ fps: FILM.fps, duration: FILM.duration }));
await probe.close();
const fps = info.fps;
const from = Math.round(parseFloat(args.from || '0') * fps);
const to = Math.min(Math.round(parseFloat(args.to || info.duration) * fps), Math.round(info.duration * fps));
const frames = [];
for (let n = from; n < to; n += step) frames.push(n);
const outFps = fps / step;
console.log(`渲染 ${frames.length} 帧（${(frames.length / outFps).toFixed(1)} 秒）${W}×${H} @${outFps}fps，${WORKERS} 个进程`);

const chunk = Math.ceil(frames.length / WORKERS);
const t0 = Date.now();
let done = 0;
const segs = [];

async function worker(k) {
  const list = frames.slice(k * chunk, (k + 1) * chunk);
  if (!list.length) return;
  const seg = path.join(segDir, `seg${k}.mp4`);
  segs[k] = seg;
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-framerate', String(outFps), '-i', '-',
    '-vf', 'vflip',
    '-c:v', 'libx264', '-preset', preview ? 'veryfast' : 'slow', '-crf', CRF, '-tune', 'animation',
    '-pix_fmt', 'yuv420p', '-g', String(outFps * 2), '-movflags', '+faststart', seg,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  ff.count = 0;
  encoders[k] = ff;
  const closed = new Promise((r) => ff.on('close', r));
  const browser = await launch();
  try {
    const page = await openFilm(browser, port, W);
    for (const n of list) {
      await page.evaluate(([n, k]) => FILM.renderPost(n, k), [n, k]);
      done++;
      if (done % 48 === 0 || done === frames.length) {
        const el = (Date.now() - t0) / 1000;
        const eta = (el / done) * (frames.length - done);
        console.log(`${done}/${frames.length}  ${(el / done * 1000).toFixed(0)} ms/帧  已用 ${el.toFixed(0)}s  剩余约 ${eta.toFixed(0)}s`);
      }
    }
  } finally {
    await browser.close();
    ff.stdin.end();
    await closed;
  }
}

await Promise.all(Array.from({ length: WORKERS }, (_, k) => worker(k)));
srv.close();

const listFile = path.join(segDir, 'list.txt');
fs.writeFileSync(listFile, segs.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
await new Promise((res, rej) => {
  const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', out], { stdio: 'inherit' });
  p.on('close', (c) => (c === 0 ? res() : rej(new Error('concat failed'))));
});
console.log(`完成 → ${out}，用时 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
