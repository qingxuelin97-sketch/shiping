// 剪辑表工具：镜头首尾相接；转场以剪辑点为中心，前后各占一半
export const FPS = 24;

export function buildTimeline(edit) {
  let t = 0;
  const shots = [];
  for (const e of edit) {
    const dur = e.dur ?? e.shot.dur;
    shots.push({ shot: e.shot, id: e.shot.id, start: t, end: t + dur, dur, trans: e.trans || null, music: e.music || null });
    t += dur;
  }
  const duration = t;

  function at(time) {
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      if (time < s.end || i === shots.length - 1) {
        if (s.trans && i > 0 && time < s.start + s.trans.dur / 2) {
          const T = s.trans.dur, prev = shots[i - 1];
          return {
            a: { shot: prev.shot, lt: time - prev.start },
            b: { shot: s.shot, lt: time - s.start },
            mix: { type: s.trans.type, p: (time - (s.start - T / 2)) / T, seed: s.trans.seed ?? i * 1.37 },
          };
        }
        const n = shots[i + 1];
        if (n && n.trans && time >= n.start - n.trans.dur / 2) {
          const T = n.trans.dur;
          return {
            a: { shot: s.shot, lt: time - s.start },
            b: { shot: n.shot, lt: time - n.start },
            mix: { type: n.trans.type, p: (time - (n.start - T / 2)) / T, seed: n.trans.seed ?? (i + 1) * 1.37 },
          };
        }
        return { a: { shot: s.shot, lt: time - s.start } };
      }
    }
    return null;
  }

  function find(id) {
    return shots.find((s) => s.id === id);
  }

  // 所有音画提示点（绝对时间）
  function cues() {
    const out = [];
    for (const s of shots) {
      out.push({ t: +s.start.toFixed(4), kind: 'shot', name: s.id, dur: s.dur, trans: s.trans, amb: s.shot.amb || null });
      if (s.music) out.push({ t: +s.start.toFixed(4), kind: 'music', name: s.music });
      const list = typeof s.shot.cues === 'function' ? s.shot.cues() : s.shot.cues || [];
      for (const c of list) out.push({ ...c, t: +(s.start + c.t).toFixed(4), shot: s.id });
    }
    out.push({ t: +duration.toFixed(4), kind: 'end', name: 'END' });
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  return { shots, duration, at, find, cues };
}
