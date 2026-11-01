// 出静帧、联系表、导出音画提示点
// node render/stills.mjs --t 10,20.5 [--w 1920] [--out build/stills]
// node render/stills.mjs --shot S02 --lt 0,4 [--w 1920]
// node render/stills.mjs --every 2 --w 480 --contact build/contact.png [--from 0 --to 60]
// node render/stills.mjs --cues build/cues.json
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, startServer, launch, openFilm, parseArgs } from './common.mjs';

const args = parseArgs(process.argv.slice(2));
const W = parseInt(args.w || '1920', 10);
const outDir = path.resolve(ROOT, args.out || 'build/stills');
fs.mkdirSync(outDir, { recursive: true });

const srv = await startServer();
const browser = await launch();
try {
  const page = await openFilm(browser, srv.address().port, W);
  const info = await page.evaluate(() => ({ fps: FILM.fps, duration: FILM.duration, shots: FILM.shots }));

  if (args.cues) {
    const cues = await page.evaluate(() => FILM.getCues());
    const f = path.resolve(ROOT, args.cues);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ fps: info.fps, duration: info.duration, shots: info.shots, cues }, null, 1));
    console.log('cues →', f, cues.length, 'duration', info.duration.toFixed(2));
  }

  const jobs = [];
  if (args.t) for (const s of String(args.t).split(',')) jobs.push({ t: parseFloat(s) });
  if (args.shot) {
    const lts = String(args.lt || '0').split(',').map(parseFloat);
    for (const lt of lts) jobs.push({ shot: args.shot, lt });
  }
  if (args.every) {
    const step = parseFloat(args.every);
    const from = parseFloat(args.from || '0'), to = parseFloat(args.to || info.duration);
    for (let t = from; t < to - 1e-6; t += step) jobs.push({ t: +t.toFixed(3), sheet: true });
  }

  const sheetFiles = [];
  const t0 = Date.now();
  for (const j of jobs) {
    let b64, name;
    if (j.shot) {
      b64 = await page.evaluate(([id, lt]) => FILM.renderShot(id, lt), [j.shot, j.lt]);
      name = `${j.shot}_${j.lt.toFixed(2)}.png`;
    } else {
      const n = Math.round(j.t * info.fps);
      b64 = await page.evaluate((n) => FILM.renderFrame(n), n);
      name = `t${j.t.toFixed(2).padStart(7, '0')}.png`;
    }
    const f = path.join(outDir, name);
    fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    if (j.sheet) sheetFiles.push({ f, t: j.t });
    else console.log(f);
  }
  if (jobs.length) console.log(`${jobs.length} 帧，平均 ${((Date.now() - t0) / jobs.length).toFixed(0)} ms/帧`);

  if (args.contact && sheetFiles.length) {
    const list = path.join(outDir, 'contact_list.json');
    fs.writeFileSync(list, JSON.stringify(sheetFiles));
    const out = path.resolve(ROOT, args.contact);
    execFileSync('python3', ['-I', path.join(ROOT, 'tools', 'contact.py'), list, out, String(args.cols || 6)], { stdio: 'inherit' });
    console.log('contact →', out);
  }
} finally {
  await browser.close();
  srv.close();
}
