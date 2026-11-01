#!/usr/bin/env python3
"""v2 配乐引擎：作曲代码记下“音符 + 力度起伏”，再按乐器分轨渲染。

    真实采样：VSCO 2 CE 弦乐组 / 独奏小提琴（当二胡）/ 长笛（当笛子、箫）/ 竖琴 / 钟琴 / 定音鼓 / 拨弦（CC0）
              Salamander 大钢琴（CC-BY 3.0，Alexander Holm）
    物理建模：古筝（audio/guzheng.py）
    General MIDI（GeneralUser GS）：钢片琴、八音盒、合唱垫底
    合成：木鱼、吊镲
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from scipy import signal  # noqa: E402
from lib import SR, ASSETS, noise, bandpass, highpass, lowpass  # noqa: E402
from sampler import SFZ, Piano, vibrato, glide, combine  # noqa: E402
from guzheng import Guzheng  # noqa: E402

V = os.path.join(ASSETS, "samples", "vsco2")
SAL = os.path.join(ASSETS, "samples", "salamander")
SF2 = os.path.join(ASSETS, "soundfont", "GeneralUser-GS.sf2")


def _lazy(fn):
    box = {}

    def get():
        if "v" not in box:
            box["v"] = fn()
        return box["v"]
    return get


# 乐器音源（按需加载）
SRC = {
    "vln": _lazy(lambda: SFZ(os.path.join(V, "ViolinEnsSusVib.sfz"))),
    "vla": _lazy(lambda: SFZ(os.path.join(V, "ViolaEnsSusVib.sfz"))),
    "vc": _lazy(lambda: SFZ(os.path.join(V, "CelloEnsSusVib.sfz"))),
    "cb": _lazy(lambda: SFZ(os.path.join(V, "ContrabassSusVB.sfz"))),
    "solo": _lazy(lambda: SFZ(os.path.join(V, "SViolinVib.sfz"))),
    "fl": _lazy(lambda: SFZ(os.path.join(V, "FluteSusVib.sfz"))),
    "flx": _lazy(lambda: SFZ(os.path.join(V, "FluteExpVib.sfz"))),
    "harp": _lazy(lambda: SFZ(os.path.join(V, "Harp.sfz"))),
    "glock": _lazy(lambda: SFZ(os.path.join(V, "Glockenspiel.sfz"))),
    "timp": _lazy(lambda: SFZ(os.path.join(V, "Timpani.sfz"))),
    "pzv": _lazy(lambda: SFZ(os.path.join(V, "ViolinEnsPizz.sfz"))),
    "pzc": _lazy(lambda: SFZ(os.path.join(V, "CelloEnsPizz.sfz"))),
    "piano": _lazy(lambda: Piano(SAL)),
    "zheng": _lazy(lambda: Guzheng()),
}


def pan2(x, p):
    """等功率声像：p -1 左 … +1 右"""
    l, r = np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)
    return np.stack([x[:, 0] * l * 1.414, x[:, 1] * r * 1.414], axis=1)


def place(dst, src, t, gain=1.0):
    i = int(round(t * SR))
    if i >= len(dst):
        return
    j0 = max(0, -i)
    i = max(0, i)
    n = min(len(src) - j0, len(dst) - i)
    if n > 0:
        dst[i:i + n] += src[j0:j0 + n] * gain


def peq(x, fc, gain_db, q=1.0):
    """峰值均衡（RBJ）"""
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * fc / SR
    al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]
    a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0).astype(np.float32)


# ---------- 合成打击乐 ----------
def woodblock(vel=70, seed=0):
    t = np.arange(int(0.25 * SR)) / SR
    rng = np.random.default_rng(seed)
    f1, f2 = 880 * (1 + rng.uniform(-0.02, 0.02)), 1340
    y = np.sin(2 * np.pi * f1 * t) * np.exp(-t * 38) + 0.5 * np.sin(2 * np.pi * f2 * t) * np.exp(-t * 55)
    y += rng.uniform(-1, 1, len(t)) * np.exp(-t * 400) * 0.3
    y *= (vel / 127) ** 1.3 * 0.5
    return np.stack([y, y], axis=1).astype(np.float32)


def cymbal(vel=60, swell=0.0, seconds=5.0, seed=0):
    """吊镲：swell>0 为软槌滚奏渐强（秒），否则轻击"""
    n = noise(seconds, seed + 50)
    x = bandpass(n, 3000, 12000) * 0.5 + bandpass(n, 900, 3000) * 0.25
    t = np.arange(len(x)) / SR
    if swell > 0:
        e = np.clip(t / swell, 0, 1) ** 2.2 * np.exp(-np.maximum(0, t - swell) * 1.6)
    else:
        e = np.exp(-t * 1.2) * (1 - np.exp(-t * 300))
    return (x * e[:, None] * (vel / 127) * 0.35).astype(np.float32)


# ---------- General MIDI 小乐器（钢片琴、八音盒、合唱） ----------
def gm_track(notes, total, program, vol=100, bend_range=2.0):
    import tinysoundfont
    syn = tinysoundfont.Synth(samplerate=SR, gain=-4)
    sfid = syn.sfload(SF2)
    syn.program_select(0, sfid, 0, program)
    syn.control_change(0, 7, vol)
    syn.control_change(0, 11, 127)
    ev = []
    for nt in notes:
        ev.append((nt["t"], 1, "on", nt))
        ev.append((nt["t"] + nt["d"], 0, "off", nt))
    ev.sort(key=lambda e: (e[0], e[1]))
    N = int(total * SR)
    out = np.zeros((N, 2), np.float32)
    pos, i = 0, 0
    while pos < N:
        t = pos / SR
        while i < len(ev) and ev[i][0] <= t + 1e-9:
            _, _, kind, nt = ev[i]
            if kind == "on":
                syn.noteon(0, int(nt["key"]), int(np.clip(nt["vel"], 1, 127)))
            else:
                syn.noteoff(0, int(nt["key"]))
            i += 1
        nxt = int(np.ceil(ev[i][0] * SR)) if i < len(ev) else N
        n = max(1, min(nxt - pos, N - pos, SR))
        out[pos:pos + n] = np.frombuffer(syn.generate(n), np.float32).reshape(-1, 2)
        pos += n
    return out


# ---------- 混响 v2：早期反射 + 频率相关衰减的晚期混响 ----------
def hall_ir(seconds=3.2, seed=11, pre=0.018, damp_hz=5200, early=10):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2), np.float32)
    # 早期反射：稀疏的几道
    for k in range(early):
        d = pre + rng.uniform(0.004, 0.09)
        g = 0.55 * np.exp(-d * 14) * rng.uniform(0.5, 1.0)
        i = int(d * SR)
        ir[i, 0] += g * rng.choice([-1, 1])
        ir[int(i * rng.uniform(0.97, 1.03)), 1] += g * rng.choice([-1, 1])
    # 晚期：两声道独立噪声，低频衰减慢、高频衰减快（分两段相加）
    tail = rng.standard_normal((n, 2)).astype(np.float32)
    start = np.clip((t - pre - 0.03) / 0.05, 0, 1)
    lo = lowpass(tail, damp_hz * 0.25, 2) * np.exp(-t * (6.9 / seconds))[:, None]
    hi = highpass(tail, damp_hz * 0.25, 2) * np.exp(-t * (6.9 / (seconds * 0.45)))[:, None]
    late = (lo + 0.6 * lowpass(hi, damp_hz, 2)) * start[:, None] * 0.12
    ir += late.astype(np.float32)
    ir /= np.sqrt((ir ** 2).sum(axis=0, keepdims=True)) + 1e-9
    return ir


def convolve_st(x, ir):
    out = np.zeros((len(x) + len(ir) - 1, 2), np.float32)
    for c in range(2):
        out[:, c] = signal.fftconvolve(x[:, c], ir[:, c])
    return out[: len(x)]


__all__ = ["SRC", "pan2", "place", "peq", "woodblock", "cymbal", "gm_track", "hall_ir", "convolve_st", "vibrato", "glide", "combine"]
