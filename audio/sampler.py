#!/usr/bin/env python3
"""SFZ 采样器（v2 配乐用）：读 SFZ 音区，按音高重采样，可随时间变化的音高（揉弦、滑音、按音），
长音交叉淡化循环，力度层与轮换，包络与力度起伏。

只把 SFZ 与采样当数据读取。调用方式：
    inst = SFZ("assets/samples/vsco2/SViolinVib.sfz")
    y = inst.note(key=69, vel=80, dur=2.0, cents=fn_or_array, release=0.6)   # 立体声 float32 @ 48k
"""
import os
import re

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000


def _num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


NOTE_NAMES = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}


def _key(v):
    """SFZ 的音高可以是数字或音名（c4、f#3）。中央 C = 60 = c4。"""
    v = str(v).strip().lower()
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    m = re.fullmatch(r"([a-g])(#|b)?(-?\d+)", v)
    if not m:
        return None
    n = NOTE_NAMES[m.group(1)] + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)
    return 12 * (int(m.group(3)) + 1) + n


def parse_sfz(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    text = re.sub(r"//[^\n]*", "", text)
    base = os.path.dirname(path)
    regions = []
    control, glob, group = {}, {}, {}
    cur = None
    # 把文本切成 <header> 与 key=value
    tokens = re.findall(r"<(\w+)>|(\w+)=([^\n<]*?)(?=\s+\w+=|\s*<|\s*$)", text, re.M)
    for hdr, k, v in tokens:
        if hdr:
            if cur is not None:
                regions.append(cur)
                cur = None
            if hdr == "group":
                group = {}
                cur = None
                mode = "group"
            elif hdr == "global":
                glob = {}
                mode = "global"
            elif hdr == "control":
                mode = "control"
            elif hdr == "region":
                cur = {**glob, **group}
                mode = "region"
            else:
                mode = "other"
            continue
        v = v.strip()
        if mode == "control":
            control[k] = v
        elif mode == "global":
            glob[k] = v
        elif mode == "group":
            group[k] = v
        elif mode == "region" and cur is not None:
            cur[k] = v
    if cur is not None:
        regions.append(cur)
    dp = control.get("default_path", "").replace("\\", "/")
    out = []
    for r in regions:
        if "sample" not in r:
            continue
        if r.get("trigger", "attack") not in ("attack", "first", "legato"):
            continue
        smp = os.path.join(base, dp, r["sample"].replace("\\", "/"))
        key = _key(r.get("key")) if "key" in r else None
        lo = _key(r.get("lokey", key if key is not None else 0))
        hi = _key(r.get("hikey", key if key is not None else 127))
        kc = _key(r.get("pitch_keycenter", key if key is not None else 60))
        out.append({
            "sample": smp, "lokey": lo, "hikey": hi, "keycenter": kc,
            "lovel": int(_num(r.get("lovel"), 0)), "hivel": int(_num(r.get("hivel"), 127)),
            "volume": _num(r.get("volume"), 0.0), "tune": _num(r.get("tune"), 0.0),
            "seq": int(_num(r.get("seq_position"), 1)), "release": _num(r.get("ampeg_release"), 0.3),
            "offset": int(_num(r.get("offset"), 0)),
        })
    return out


_CACHE = {}


def load_sample(path):
    """读采样 → 立体声 float32，按需重采样到 48k。"""
    if path in _CACHE:
        return _CACHE[path]
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    if x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    x = x[:, :2]
    if sr != SR:
        g = np.gcd(sr, SR)
        x = signal.resample_poly(x, SR // g, sr // g, axis=0).astype(np.float32)
    _CACHE[path] = x
    return x


def _extend(x, need, xfade_s=0.35):
    """长音：在稳定段交叉淡化循环，直到够长。"""
    n = len(x)
    if need <= n:
        return x
    e = np.abs(x).mean(axis=1)
    k = max(1, int(0.05 * SR))
    sm = np.convolve(e, np.ones(k) / k, mode="same")
    peak = sm.max() + 1e-9
    a = int(0.35 * n)
    # 循环终点：最后一个仍有一半响度的位置（避开采样结尾的自然衰减）
    idx = np.nonzero(sm > 0.5 * np.median(sm[a:]) )[0]
    b = int(idx[-1]) if len(idx) else int(0.9 * n)
    b = min(b, int(0.95 * n))
    if b - a < int(0.6 * SR):
        a, b = int(0.2 * n), int(0.9 * n)
    xf = min(int(xfade_s * SR), (b - a) // 3)
    seg = x[a:b]
    out = [x[:b]]
    total = b
    t = np.linspace(0, np.pi / 2, xf, dtype=np.float32)[:, None]
    fin, fout = np.sin(t), np.cos(t)
    while total < need:
        prev = out[-1]
        tail = prev[-xf:] * fout + seg[:xf] * fin
        out[-1] = prev[:-xf]
        out.append(tail)
        out.append(seg[xf:])
        total += len(seg) - xf
    del peak
    return np.concatenate(out, axis=0)


def _interp(x, pos):
    """4 点三次（Catmull-Rom）插值读取立体声。"""
    i = np.floor(pos).astype(np.int64)
    f = (pos - i).astype(np.float32)[:, None]
    n = len(x)
    i0 = np.clip(i - 1, 0, n - 1)
    i1 = np.clip(i, 0, n - 1)
    i2 = np.clip(i + 1, 0, n - 1)
    i3 = np.clip(i + 2, 0, n - 1)
    p0, p1, p2, p3 = x[i0], x[i1], x[i2], x[i3]
    return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)))


class SFZ:
    def __init__(self, path, gain_db=0.0, vel_curve=1.6):
        self.path = path
        self.regions = parse_sfz(path)
        if not self.regions:
            raise ValueError("no regions in " + path)
        self.gain = 10 ** (gain_db / 20)
        self.vel_curve = vel_curve
        self.rr = {}

    def pick(self, key, vel):
        cand = [r for r in self.regions if r["lokey"] <= key <= r["hikey"] and r["lovel"] <= vel <= r["hivel"]]
        if not cand:
            # 超出音域：取最近的音区
            best = min(self.regions, key=lambda r: min(abs(key - r["lokey"]), abs(key - r["hikey"])) * 4 + abs(vel - (r["lovel"] + r["hivel"]) / 2) / 64)
            cand = [r for r in self.regions if r["sample"] == best["sample"]] or [best]
        seqs = sorted(set(r["seq"] for r in cand))
        if len(seqs) > 1:
            c = self.rr.get(key, 0)
            self.rr[key] = c + 1
            want = seqs[c % len(seqs)]
            cand = [r for r in cand if r["seq"] == want] or cand
        return cand[0]

    def note(self, key, vel, dur, cents=None, release=None, attack=0.0, amp=None, start_offset=0.0):
        """渲染一个音：dur 为按住的时长（秒），之后按 release 秒淡出。
        cents：None、常数、或 f(t秒数组) → 音分偏移（揉弦、滑音、按音）
        amp：None 或 f(t) → 力度起伏（乘在包络上）"""
        r = self.pick(int(round(key)), int(np.clip(vel, 1, 127)))
        x = load_sample(r["sample"])
        rel = r["release"] if release is None else release
        n_out = int((dur + rel) * SR) + 1
        t = np.arange(n_out, dtype=np.float32) / SR
        semis = key - r["keycenter"] + r["tune"] / 100.0
        if cents is None:
            c = np.zeros(n_out, np.float32)
        elif callable(cents):
            c = np.asarray(cents(t), np.float32)
        else:
            c = np.full(n_out, float(cents), np.float32)
        ratio = np.power(2.0, (semis + c / 100.0) / 12.0)
        pos = r["offset"] + int(start_offset * SR) + np.concatenate([[0.0], np.cumsum(ratio[:-1], dtype=np.float64)])
        need = int(pos[-1]) + 8
        src = _extend(x, need)
        y = _interp(src, pos)
        # 包络：起音、按住、释放
        env = np.ones(n_out, np.float32)
        if attack > 0:
            na = min(n_out, int(attack * SR))
            env[:na] = np.linspace(0, 1, na, dtype=np.float32) ** 1.5
        nd = int(dur * SR)
        if n_out > nd:
            k = np.arange(n_out - nd, dtype=np.float32) / max(1, n_out - nd)
            env[nd:] *= np.exp(-5.0 * k) * (1 - k)
        if amp is not None:
            env *= np.asarray(amp(t), np.float32)
        g = self.gain * 10 ** (r["volume"] / 20) * (np.clip(vel, 1, 127) / 127.0) ** self.vel_curve
        return (y * (env * g)[:, None]).astype(np.float32)


# ---------- 常用的音高曲线 ----------
def vibrato(rate=5.5, depth=20.0, delay=0.25, ramp=0.4, wobble=0.15, seed=0):
    """揉弦：延迟后渐入的正弦颤音，速度与深度带一点随机起伏。"""
    rng = np.random.default_rng(seed)
    ph = rng.uniform(0, 2 * np.pi)

    def f(t):
        k = np.clip((t - delay) / ramp, 0, 1)
        r = rate * (1 + wobble * 0.3 * np.sin(2 * np.pi * 0.7 * t + ph))
        return depth * k * np.sin(2 * np.pi * np.cumsum(r) / SR + ph)
    return f


def glide(from_cents, time=0.12, curve=2.0):
    """滑音：从 from_cents 滑到 0。"""
    def f(t):
        k = np.clip(t / max(time, 1e-3), 0, 1)
        return from_cents * (1 - k) ** curve
    return f


def combine(*fs):
    def f(t):
        out = np.zeros_like(t)
        for g in fs:
            if g is not None:
                out = out + (g(t) if callable(g) else g)
        return out
    return f


class Piano(SFZ):
    """Salamander 大钢琴（CC-BY 3.0, Alexander Holm）：每小三度一个采样，取 4 个力度层。"""

    def __init__(self, folder, gain_db=0.0, layers=(4, 7, 10, 13)):
        names = ["A0", "C1", "D#1", "F#1"]
        for o in range(1, 8):
            names += [f"A{o}", f"C{o + 1}", f"D#{o + 1}", f"F#{o + 1}"]
        names = [n for n in names if n not in ("D#8", "F#8")]
        bounds = [0, 40, 66, 92, 128]
        self.regions = []
        for nm in names:
            k = _key(nm.lower())
            for li, lay in enumerate(layers):
                p = os.path.join(folder, "Samples", f"{nm}v{lay}.flac")
                if not os.path.exists(p):
                    continue
                self.regions.append({"sample": p, "lokey": k - 1, "hikey": k + 1, "keycenter": k, "lovel": bounds[li], "hivel": bounds[li + 1] - 1,
                                     "volume": 0.0, "tune": 0.0, "seq": 1, "release": 1.2, "offset": 0})
        self.path = folder
        self.gain = 10 ** (gain_db / 20)
        self.vel_curve = 1.2
        self.rr = {}
