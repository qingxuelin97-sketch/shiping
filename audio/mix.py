#!/usr/bin/env python3
"""混音 v2：配乐 + 环境声 + 音效
   → 音乐响起时环境声自动让位（侧链压低最多 6 dB）
   → 总线轻压缩（RMS，1.8:1）→ 预读峰值限幅 → ffmpeg loudnorm 两遍
   → build/audio/final.wav（-16 LUFS，真峰值 ≤ -1.5 dBTP）"""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from scipy import signal  # noqa: E402
from lib import SR, BUILD, db, write, peak_db, rms_db  # noqa: E402

GAINS = {"score.wav": 0.0, "amb.wav": -1.0, "fx.wav": -1.5}
TP_CEIL = -2.4  # 真峰值上限（dBTP）


def envelope_db(x, win=0.3):
    m = np.mean(x ** 2, axis=1)
    k = max(1, int(win * SR))
    e = signal.fftconvolve(m, np.ones(k) / k, mode="same")
    return 10 * np.log10(np.maximum(e, 1e-12))


def smooth_gain(g_db, attack=0.3, release=1.0):
    """增益跟随（dB）：往下压快、回升慢。按 1 ms 分块取块内最小值计算，再展开回原采样率。"""
    step = SR // 1000
    n = len(g_db)
    pad = (-n) % step
    gb = np.concatenate([g_db, np.full(pad, g_db[-1])]).reshape(-1, step).min(axis=1)
    a1 = np.exp(-1 / (attack * 1000))
    r1 = np.exp(-1 / (release * 1000))
    o = np.empty_like(gb)
    y = 0.0
    for i, v in enumerate(gb):
        c = a1 if v < y else r1
        y = c * y + (1 - c) * v
        o[i] = y
    out = np.repeat(o, step)[:n]
    # 1 ms 的台阶用短滑动平均抹平
    k = step
    return signal.fftconvolve(out, np.ones(k) / k, mode="same")


def compressor(x, thr_db=-18.0, ratio=1.8, attack=0.03, release=0.3):
    lvl = envelope_db(x, 0.05)
    over = np.maximum(0, lvl - thr_db)
    gr = -over * (1 - 1 / ratio)
    gr = smooth_gain(gr, attack, release)
    return x * db(gr)[:, None], gr


def limiter(x, ceiling_db=-1.0, look=0.005, release=0.08):
    c = db(ceiling_db)
    pk = np.max(np.abs(x), axis=1)
    k = int(look * SR)
    # 预读：未来 k 个样本里的最大峰值
    pk = np.maximum.reduce([np.roll(pk, -i) for i in range(0, k, max(1, k // 8))])
    need = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    g_db = 20 * np.log10(need)
    g_db = smooth_gain(g_db, 0.001, release)
    return x * db(g_db)[:, None]


def lufs(x):
    """ITU-R BS.1770 积分响度（K 计权 + 门限）"""
    # K 计权两级滤波（48 kHz 系数）
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    p = np.sum(y ** 2, axis=1)
    cs = np.concatenate([[0.0], np.cumsum(p)])
    starts = np.arange(0, len(p) - blk, hop)
    z = (cs[starts + blk] - cs[starts]) / blk
    l = -0.691 + 10 * np.log10(z + 1e-12)
    z = z[l > -70]
    if len(z) == 0:
        return -70.0
    rel = -0.691 + 10 * np.log10(z.mean()) - 10
    l = -0.691 + 10 * np.log10(z + 1e-12)
    return float(-0.691 + 10 * np.log10(z[l > rel].mean()))


def true_peak_env(x, over=4):
    """4 倍过采样估计每个样本处的真峰值"""
    up = signal.resample_poly(x, over, 1, axis=0)
    a = np.max(np.abs(up), axis=1)
    n = len(x)
    return a[: n * over].reshape(n, over).max(axis=1)


def tp_limiter(x, ceiling_db=-1.8, look=0.005, release=0.08):
    """真峰值限幅：预读窗口内取最小增益再做等长滑动平均——峰值处一定压到天花板以下；
    另用慢回升的增益曲线避免抽动，两者取小。"""
    from scipy.ndimage import minimum_filter1d
    c = db(ceiling_db)
    pk = true_peak_env(x)
    req = np.minimum(1.0, c / np.maximum(pk, 1e-9))
    k = int(look * SR)
    gmin = minimum_filter1d(req, size=k, origin=-(k // 2) + (0 if k % 2 else 1) - 0)
    precise = signal.fftconvolve(gmin, np.ones(k) / k, mode="full")[:len(req)]
    slow = db(smooth_gain(20 * np.log10(np.maximum(gmin, 1e-6)), 0.001, release))
    g = np.minimum(precise, slow)
    return x * g[:, None]


def main():
    tracks = {}
    n = 0
    for name in GAINS:
        x, sr = sf.read(os.path.join(BUILD, name), always_2d=True, dtype="float32")
        assert sr == SR
        tracks[name] = x * db(GAINS[name])
        n = max(n, len(x))
        print(f"{name:10s} peak {peak_db(x):6.1f} dBFS  rms {rms_db(x):6.1f} dBFS")
    for k in tracks:
        if len(tracks[k]) < n:
            tracks[k] = np.concatenate([tracks[k], np.zeros((n - len(tracks[k]), 2), np.float32)])
    # 环境声让位：音乐越响，环境声压得越低（最多 -6 dB）
    music = envelope_db(tracks["score.wav"], 0.4)
    duck = -6.0 * np.clip((music - (-40.0)) / 14.0, 0, 1)
    duck = smooth_gain(duck, 0.4, 1.2)
    tracks["amb.wav"] = tracks["amb.wav"] * db(duck)[:, None]
    print(f"环境声让位：平均 {duck.mean():.1f} dB，最多 {duck.min():.1f} dB")
    mix = tracks["score.wav"] + tracks["amb.wav"] + tracks["fx.wav"]
    mix, gr = compressor(mix)
    print(f"总线压缩：平均 {gr.mean():.2f} dB，最多 {gr.min():.1f} dB")
    # 先把积分响度推到 -16 LUFS，再做真峰值限幅；上限取 -2.4 dBTP，给 AAC 编码后的峰值回升留出余量
    # （实测 AAC 192k 会让真峰值升高约 0.5 dB），成片仍满足 ≤ -1.5 dBTP。loudnorm 只做很小的线性修正
    L0 = lufs(mix)
    mix = mix * db(-16.0 - L0)
    mix = tp_limiter(mix, TP_CEIL)
    mix = tp_limiter(mix, TP_CEIL)
    print(f"响度：{L0:.1f} → {lufs(mix):.1f} LUFS，真峰值 {20 * np.log10(true_peak_env(mix).max()):.2f} dBTP")
    pre = os.path.join(BUILD, "premix.wav")
    write(pre, mix)
    # loudnorm 第一遍：测量
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", pre, "-af", "loudnorm=I=-16:TP=-2.2:LRA=14:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True)
    txt = r.stderr
    js = json.loads(txt[txt.rindex("{"): txt.rindex("}") + 1])
    print("测得：", {k: js[k] for k in ("input_i", "input_tp", "input_lra")})
    out = os.path.join(BUILD, "final.wav")
    af = ("loudnorm=I=-16:TP=-2.2:LRA=14:linear=true:"
          f"measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:"
          f"measured_thresh={js['input_thresh']}:offset={js['target_offset']}:print_format=summary")
    subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", pre, "-af", af, "-ar", str(SR), "-c:a", "pcm_s24le", out],
                   check=True, capture_output=True)
    print("final →", out)


if __name__ == "__main__":
    main()
