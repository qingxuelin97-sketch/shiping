"""音频共用：读写、摆放、滤波、混响、包络。采样率 48 kHz，立体声 float32。"""
import json
import os

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build", "audio")
ASSETS = os.path.join(ROOT, "assets")
os.makedirs(BUILD, exist_ok=True)


def load_cues():
    with open(os.path.join(ROOT, "build", "cues.json"), encoding="utf-8") as f:
        return json.load(f)


def zeros(seconds):
    return np.zeros((int(seconds * SR) + 1, 2), np.float32)


def db(x):
    return 10 ** (x / 20.0)


def stereo(x):
    x = np.asarray(x, np.float32)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    return x


def load(path, sr=SR):
    data, fs = sf.read(path, always_2d=True, dtype="float32")
    if data.shape[1] == 1:
        data = np.repeat(data, 2, axis=1)
    data = data[:, :2]
    if fs != sr:
        g = np.gcd(int(fs), int(sr))
        data = signal.resample_poly(data, sr // g, int(fs) // g, axis=0).astype(np.float32)
    return data


def asset(rel):
    return load(os.path.join(ASSETS, rel))


def place(dst, src, t, gain=1.0, pan=0.0):
    """把 src 放到 dst 的 t 秒处（等功率声像）。"""
    src = stereo(src)
    i = int(round(t * SR))
    if i >= len(dst):
        return
    j0 = max(0, -i)
    i = max(0, i)
    n = min(len(dst) - i, len(src) - j0)
    if n <= 0:
        return
    a = (pan + 1) * np.pi / 4
    gl, gr = np.cos(a) * np.sqrt(2), np.sin(a) * np.sqrt(2)
    dst[i:i + n, 0] += src[j0:j0 + n, 0] * gain * gl
    dst[i:i + n, 1] += src[j0:j0 + n, 1] * gain * gr


def fade(x, fin=0.0, fout=0.0):
    x = x.copy()
    n = len(x)
    a = int(fin * SR)
    b = int(fout * SR)
    if a > 0:
        x[:a] *= np.sin(np.linspace(0, np.pi / 2, a))[:, None] ** 2
    if b > 0:
        x[n - b:] *= np.cos(np.linspace(0, np.pi / 2, b))[:, None] ** 2
    return x


def seg(x, t0, t1):
    return x[int(t0 * SR):int(t1 * SR)]


def loop_to(x, seconds, xfade=1.0):
    """把一段环境声循环到指定长度（交叉淡化接缝）。"""
    n = int(seconds * SR)
    if len(x) >= n:
        return x[:n].copy()
    xf = int(xfade * SR)
    out = np.zeros((n, 2), np.float32)
    pos = 0
    first = True
    while pos < n:
        piece = x.copy()
        if not first:
            piece[:xf] *= np.linspace(0, 1, xf)[:, None]
        piece[-xf:] *= np.linspace(1, 0, xf)[:, None]
        m = min(len(piece), n - pos)
        out[pos:pos + m] += piece[:m]
        pos += len(piece) - xf
        first = False
    return out


def butter(x, kind, fc, order=2):
    sos = signal.butter(order, fc, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0).astype(np.float32)


def lowpass(x, fc, order=2):
    return butter(x, "lowpass", fc, order)


def highpass(x, fc, order=2):
    return butter(x, "highpass", fc, order)


def bandpass(x, lo, hi, order=2):
    return butter(x, "bandpass", [lo, hi], order)


def noise(seconds, seed=0):
    rng = np.random.default_rng(seed)
    return rng.standard_normal((int(seconds * SR), 2)).astype(np.float32)


def env(n, attack, release, shape=2.0):
    """线性起、指数落的包络（样本数 n，attack/release 秒）。"""
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    r = np.exp(-np.maximum(t - attack, 0) / max(release, 1e-4) * shape)
    return (a * r).astype(np.float32)


def reverb_ir(seconds=2.8, seed=7, damp=0.6):
    n = int(seconds * SR)
    rng = np.random.default_rng(seed)
    t = np.arange(n) / SR
    tau = seconds / 6.9
    ir = rng.standard_normal((n, 2)).astype(np.float32) * np.exp(-t / tau)[:, None]
    dark = lowpass(ir, 2500, 1)
    w = np.clip(t / seconds, 0, 1)[:, None] * damp
    ir = ir * (1 - w) + dark * w
    pre = int(0.012 * SR)
    ir = np.concatenate([np.zeros((pre, 2), np.float32), ir])
    ir /= np.sqrt((ir ** 2).sum(axis=0, keepdims=True))
    return ir


def convolve(x, ir):
    out = np.zeros((len(x) + len(ir) - 1, 2), np.float32)
    for c in range(2):
        out[:, c] = signal.fftconvolve(x[:, c], ir[:, c])
    return out[:len(x)]


def reverb(x, wet=0.25, seconds=2.8, seed=7, damp=0.6):
    return (x * (1 - wet * 0.5) + convolve(x, reverb_ir(seconds, seed, damp)) * wet).astype(np.float32)


def write(path, x):
    sf.write(path, np.clip(x, -1, 1), SR, subtype="PCM_24")


def peak_db(x):
    p = float(np.max(np.abs(x)))
    return 20 * np.log10(max(p, 1e-9))


def rms_db(x):
    r = float(np.sqrt(np.mean(x.astype(np.float64) ** 2)))
    return 20 * np.log10(max(r, 1e-9))
