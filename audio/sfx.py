#!/usr/bin/env python3
"""环境声与音效：按 build/cues.json 的镜头和提示点摆放。
环境声来自 OpenGameArt 的 CC0 实录；动作音效大多由程序合成。
输出 build/audio/amb.wav 与 build/audio/fx.wav
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from lib import (SR, BUILD, load_cues, zeros, place, fade, seg, loop_to, lowpass, highpass, bandpass,  # noqa: E402
                 noise, env, reverb, asset, write, stereo, db, peak_db)

CUES = load_cues()
DUR = CUES["duration"] + 1.0
RNG = np.random.default_rng(7)

# ---------------- 素材 ----------------
BIRDS = asset("sfx/park_ambience_birds.wav")
WINDP = asset("sfx/park_ambience_wind.wav")
WIND2 = asset("sfx/wind_background_noise_2.wav")
GUST = asset("sfx/short_wind_sound.wav")
BIRD1 = asset("sfx/birdchirping071414.wav")
BIRD2 = asset("sfx/birds-isaiah658.ogg")
CICADA = np.concatenate([asset("sfx/cicadas_1.ogg"), asset("sfx/cicadas_2.ogg")])
ENGINE = asset("sfx/engine_sound.mp3")
SNOW = [asset("sfx/SnowWalk/SnowWalk/SnowWalk.ogg"), asset("sfx/SnowWalk/SnowWalk/SnowWalk2.ogg")]


def norm(x, peak=-6.0):
    p = peak_db(x)
    return (x * db(peak - p)).astype(np.float32)


# ---------------- 程序合成音效 ----------------
def tone(freq, seconds, decay, phase_mod=None):
    t = np.arange(int(seconds * SR)) / SR
    f = freq(t) if callable(freq) else np.full_like(t, freq)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) * np.exp(-t * decay)).astype(np.float32)


def s_inkdrop():
    x = tone(lambda t: 420 + 900 * np.exp(-t * 28), 0.4, 16) * 0.7
    x = stereo(x) + bandpass(noise(0.4, 1), 2500, 7000) * env(int(0.4 * SR), 0.002, 0.03)[:, None] * 0.25
    return norm(reverb(x, 0.4, 1.6), -8)


def s_bloom():
    n = noise(3.5, 2)
    e = np.sin(np.linspace(0, np.pi, len(n))) ** 2
    x = lowpass(n, 500, 2) * e[:, None] * 0.6 + bandpass(n, 900, 2400) * (e ** 3)[:, None] * 0.15
    return norm(reverb(x, 0.4, 2.5), -16)


def s_bamboo(i=0):
    x = zeros(0.7)
    for k in range(3):
        c = bandpass(noise(0.08, 10 + k + i * 3), 1100 + 400 * k, 3200) * env(int(0.08 * SR), 0.001, 0.015)[:, None]
        place(x, c, 0.05 + k * 0.11 + RNG.uniform(0, 0.03), 0.8)
    t = np.arange(int(0.3 * SR)) / SR
    saw = ((t * (170 + 25 * np.sin(t * 40))) % 1.0 - 0.5) * np.exp(-t * 7) * (1 + 0.5 * np.sin(t * 300))
    place(x, bandpass(stereo(saw.astype(np.float32)), 300, 2400), 0.3, 0.25)
    return norm(reverb(x, 0.25, 1.2), -12)


def s_paper(seconds=0.9, seed=4):
    n = highpass(noise(seconds, seed), 1800)
    rng = np.random.default_rng(seed)
    e = np.zeros(len(n), np.float32)
    for _ in range(int(seconds * 22)):
        i = rng.integers(0, len(n) - 2400)
        e[i:i + 2400] += np.exp(-np.arange(2400) / 500.0) * rng.uniform(0.3, 1)
    return norm(n * e[:, None], -16)


def s_brush(seconds=0.8, seed=5):
    n = bandpass(noise(seconds, seed), 1000, 5200)
    e = np.sin(np.linspace(0, np.pi, len(n))) ** 1.5
    return norm(n * e[:, None], -20)


def s_step(seed, kind="grass"):
    if kind == "snow":
        x = SNOW[seed % 2]
        # 每一步略变速、变响，避免机械重复
        r = 1 + RNG.uniform(-0.06, 0.06)
        idx = np.clip((np.arange(int(len(x) / r)) * r).astype(int), 0, len(x) - 1)
        return norm(x[idx], -14 + RNG.uniform(-2, 1))
    # 草地：脚跟的闷响 + 草叶的沙沙
    thud = lowpass(noise(0.09, seed), 380, 2) * env(int(0.09 * SR), 0.003, 0.03)[:, None]
    rus = bandpass(noise(0.16, seed + 500), 1800, 6500) * env(int(0.16 * SR), 0.01, 0.06)[:, None] * 0.35
    x = zeros(0.2)
    place(x, thud, 0.0, 1.0)
    place(x, rus, 0.012, 1.0)
    return norm(x, -18 + RNG.uniform(-2, 1))


def s_steps(seconds, rate, kind="grass", seed=0):
    x = zeros(seconds + 0.8)
    t = 0.0
    k = 0
    while t < seconds:
        place(x, s_step(seed + k, kind), t, 1.0 * RNG.uniform(0.7, 1.0), pan=RNG.uniform(-0.1, 0.1))
        t += 1.0 / rate * RNG.uniform(0.9, 1.1)
        k += 1
    return x


def s_crash():
    x = zeros(0.9)
    place(x, s_paper(0.5, 9), 0.02, 1.0)
    place(x, norm(lowpass(noise(0.15, 3), 300) * env(int(0.15 * SR), 0.002, 0.05)[:, None], -10), 0.0, 1.0)
    return norm(x, -12)


def s_whoosh(seconds=1.4, seed=6, rise=True):
    n = noise(seconds, seed)
    u = np.linspace(0, 1, len(n))
    lo, hi = bandpass(n, 250, 900), bandpass(n, 1200, 4500)
    w = u if rise else 1 - u
    e = np.sin(np.pi * u) ** 1.2
    x = (lo * (1 - w)[:, None] + hi * w[:, None]) * e[:, None]
    return norm(x, -14)


def s_flutter(seconds=2.0, seed=8):
    n = bandpass(noise(seconds, seed), 500, 2600)
    t = np.arange(len(n)) / SR
    am = 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 17 * t + 2 * np.sin(t * 3)))
    e = np.sin(np.linspace(0, np.pi, len(n)))
    return norm(n * (am * e)[:, None], -20)


def s_flutter_bed(seconds, amp=0.6, seed=8):
    """风筝在天上：纸面扑棱声，随风时强时弱"""
    n = bandpass(noise(seconds, seed), 400, 2400)
    t = np.arange(len(n)) / SR
    rng = np.random.default_rng(seed)
    gust = 0.55 + 0.45 * np.sin(2 * np.pi * 0.23 * t + rng.uniform(0, 6)) * np.sin(2 * np.pi * 0.11 * t + rng.uniform(0, 6))
    rate = 13 + 4 * np.sin(2 * np.pi * 0.3 * t)
    ph = 2 * np.pi * np.cumsum(rate) / SR
    am = (0.5 + 0.5 * np.sin(ph)) ** 3
    e = np.minimum(1, np.minimum(t / 0.8, (seconds - t) / 0.8))
    x = n * (am * gust * e)[:, None] + lowpass(noise(seconds, seed + 1), 300, 2) * (gust * e * 0.3)[:, None]
    return norm(x, -20) * amp


def s_string_taut():
    """放飞瞬间线一下绷紧：短促上扬的“嗡”"""
    t = np.arange(int(0.6 * SR)) / SR
    f = 160 + 520 * (1 - np.exp(-t * 9))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5) * (1 - np.exp(-t * 80))
    x = stereo(x.astype(np.float32)) + bandpass(noise(0.6, 61), 2000, 6000) * env(int(0.6 * SR), 0.002, 0.08)[:, None] * 0.2
    return norm(reverb(x, 0.2, 1.0), -16)


def s_seal():
    x = zeros(0.5)
    place(x, stereo(tone(lambda t: 95 - 30 * t, 0.3, 14)), 0.0, 1.0)
    place(x, s_paper(0.2, 12), 0.0, 0.5)
    return norm(reverb(x, 0.2, 0.8), -10)


def s_gust_petals():
    x = zeros(4.0)
    place(x, s_gust(), 0.0, 0.7)
    place(x, s_shimmer(), 0.3, 0.6)
    return x


def s_gust(big=False):
    g = norm(GUST, -10)
    if big:
        x = zeros(4.5)
        place(x, g, 0, 1.0)
        place(x, g, 0.7, 0.8)
        n = noise(len(x) / SR + 0.01, 21)[: len(x)]
        t = np.arange(len(n)) / SR
        howl = bandpass(n, 300, 900) * (np.sin(np.pi * t / 4.5) ** 2)[:, None]
        x = x + norm(howl, -12)
        return norm(x, -8)
    return g


def s_tear():
    n = zeros(0.6)
    k = 0
    for i in range(160):
        t = RNG.uniform(0, 0.5)
        c = highpass(noise(0.004, 100 + i), 2000) * 0.8
        place(n, c, t, RNG.uniform(0.3, 1))
        k += 1
    return norm(n, -14)


def s_snap():
    # 线绷断：高音拨弦 + 一声“咻”
    N = int(1.2 * SR)
    p = int(SR / 1480)
    buf = np.random.default_rng(3).uniform(-1, 1, p)
    out = np.zeros(N, np.float32)
    for i in range(N):
        out[i] = buf[i % p]
        buf[i % p] = 0.5 * (buf[i % p] + buf[(i + 1) % p]) * 0.994
    x = stereo(out * np.exp(-np.arange(N) / SR * 3.5))
    x[: int(0.3 * SR)] += s_whoosh(0.3, 31, rise=False)[: int(0.3 * SR)] * 0.4
    return norm(reverb(x, 0.35, 2.0), -8)


def s_swallows(seconds=2.2, seed=9):
    x = zeros(seconds + 0.5)
    rng = np.random.default_rng(seed)
    t = 0.0
    while t < seconds:
        d = rng.uniform(0.05, 0.11)
        f0 = rng.uniform(3200, 4800)
        c = tone(lambda tt: f0 + 1400 * np.sin(tt * 90) * (tt / d), d, 30) * np.sin(np.linspace(0, np.pi, int(d * SR)))
        place(x, c, t, rng.uniform(0.4, 1), pan=float(np.clip(1 - 2 * t / seconds, -1, 1)) * 0.6)
        t += rng.uniform(0.07, 0.25)
    return norm(highpass(x, 2000), -18)


def s_rustle():
    n = bandpass(noise(1.2, 41), 900, 6000)
    e = np.zeros(len(n), np.float32)
    for _ in range(60):
        i = RNG.integers(0, len(n) - 3000)
        e[i:i + 3000] += np.exp(-np.arange(3000) / 700.0) * RNG.uniform(0.2, 1)
    return norm(n * e[:, None], -16)


def s_knot():
    x = stereo(tone(lambda t: 520 + 40 * np.sin(t * 60), 0.25, 9) * 0.3)
    x[: int(0.2 * SR)] += bandpass(noise(0.2, 51), 800, 3000) * env(int(0.2 * SR), 0.01, 0.06)[:, None] * 0.5
    return norm(x, -14)


def s_shimmer(seconds=2.5):
    x = zeros(seconds + 1)
    for k in range(14):
        f = 2000 + k * 260
        place(x, stereo(tone(f, 1.4, 4) * 0.2), k * seconds / 18, 1.0, pan=np.sin(k) * 0.5)
    return norm(reverb(x, 0.5, 2.5), -20)


def s_bus():
    e = lowpass(ENGINE, 1400, 2)
    e = loop_to(e, 5.0)
    e = fade(e, 0.4, 2.5)
    return norm(e, -12)


def s_busdoor():
    x = zeros(0.8)
    for k, tt in enumerate([0.0, 0.35]):
        place(x, norm(lowpass(noise(0.1, 60 + k), 500) * env(int(0.1 * SR), 0.002, 0.03)[:, None], -14), tt, 1)
    return x


# ---------------- v2 新增 ----------------
def s_clap(n=3, gap=0.3, seed=12):
    x = zeros(n * gap + 0.4)
    for k in range(n):
        c = bandpass(noise(0.06, seed + k), 900, 3200) * env(int(0.06 * SR), 0.001, 0.02)[:, None]
        place(x, c, 0.02 + k * gap * (1 + RNG.uniform(-0.06, 0.06)), 0.9 - 0.15 * (k == n - 1))
    return norm(reverb(x, 0.2, 0.8), -10)


def s_reel_tap():
    t = np.arange(int(0.35 * SR)) / SR
    knock = np.sin(2 * np.pi * 310 * t) * np.exp(-t * 30) + 0.4 * np.sin(2 * np.pi * 760 * t) * np.exp(-t * 45)
    x = stereo(knock.astype(np.float32)) + bandpass(noise(0.35, 21), 1500, 5000) * env(int(0.35 * SR), 0.002, 0.05)[:, None] * 0.12
    return norm(reverb(x, 0.25, 1.2), -12)


def s_fiber(i=0):
    # 一根纤维绷断：慢镜头里拉长、压低的“叮”，带长尾
    f = 1900 - i * 260
    t = np.arange(int(1.6 * SR)) / SR
    x = np.sin(2 * np.pi * f * t + 2 * np.sin(2 * np.pi * 7 * t)) * np.exp(-t * 4.5)
    x += np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 9) * 0.3
    x = stereo(x.astype(np.float32)) + bandpass(noise(1.6, 30 + i), 3000, 9000) * env(int(1.6 * SR), 0.001, 0.02)[:, None] * 0.3
    return norm(reverb(x, 0.45, 2.6), -14)


def s_snap_slow():
    # 断开：低沉拉长的“嘣”+ 往外甩的风声
    t = np.arange(int(3.0 * SR)) / SR
    tw = np.sin(2 * np.pi * (180 * np.exp(-t * 1.5) + 70) * t) * np.exp(-t * 2.2)
    x = stereo(tw.astype(np.float32)) * 0.8
    x += lowpass(noise(3.0, 33), 700, 2) * env(int(3.0 * SR), 0.004, 0.5)[:, None] * 0.6
    place(x, s_whoosh(2.2, 34), 0.15, 0.5)
    return norm(reverb(x, 0.5, 3.0), -6)


def s_snow_brush(seed=40):
    x = zeros(1.0)
    for k in range(2):
        c = bandpass(noise(0.32, seed + k), 1200, 6000) * np.sin(np.linspace(0, np.pi, int(0.32 * SR)))[:, None] ** 2
        place(x, c, 0.05 + k * 0.34, 0.8)
    return norm(x, -18)


def s_reel_lift():
    x = zeros(1.0)
    place(x, s_reel_tap(), 0.0, 0.6)
    place(x, s_step(44, "snow"), 0.05, 0.5)
    return norm(x, -14)


def s_bus_far():
    x = lowpass(seg(ENGINE, 2.0, 6.0), 500, 2)
    x = fade(x, 0.3, 2.8)
    return norm(x, -26)


FX = {
    "inkdrop": lambda c: (s_inkdrop(), 0.9, 0.0),
    "bloom": lambda c: (s_bloom(), 0.6, 0.0),
    "swallows": lambda c: (s_swallows(), 0.6, 0.0),
    "bamboo": lambda c: (s_bamboo(c.get("i", 0)), 0.7, 0.15),
    "paper": lambda c: (s_paper(), 0.7, 0.0),
    "brush": lambda c: (s_brush(1.6, int(c["t"] * 10)), 0.8, 0.0),
    "jump": lambda c: (s_step(int(c["t"] * 10)), 0.8, -0.2),
    "run": lambda c: (s_steps(2.8, 5.0, seed=int(c["t"])), 0.65, 0.0),
    "child_run": lambda c: (s_steps(5.0, 5.5, seed=int(c["t"])), 0.55, -0.2),
    "steps": lambda c: (s_steps(6.0, 1.8, seed=int(c["t"])), 0.55, -0.2),
    "snow_steps": lambda c: (s_steps(6.2, 1.6, "snow", seed=int(c["t"])), 0.55, -0.2),
    "crash": lambda c: (s_crash(), 0.9, -0.3),
    "whoosh": lambda c: (s_whoosh(1.6, int(c["t"])), 0.8, -0.3),
    "flutter": lambda c: (s_flutter(2.5, int(c["t"])), 0.6, -0.4),
    "wind_up": lambda c: (s_whoosh(4.5, int(c["t"]), rise=True), 0.7, 0.0),
    "seal": lambda c: (s_seal(), 0.9, 0.2),
    "gust": lambda c: (s_gust(), 0.7, -0.2),
    "gust_big": lambda c: (s_gust(True), 1.0, 0.0),
    "gust_petals": lambda c: (s_gust_petals(), 0.8, 0.0),
    "tear": lambda c: (s_tear(), 0.8, -0.3),
    "snap": lambda c: (s_snap(), 1.0, -0.2),
    "birds": lambda c: (norm(BIRD2[: int(6 * SR)], -18), 0.7, 0.3),
    "bus": lambda c: (s_bus(), 0.8, -0.6),
    "bus_door": lambda c: (s_busdoor(), 0.6, -0.5),
    "rustle": lambda c: (s_rustle(), 0.7, 0.0),
    "knot": lambda c: (s_knot(), 0.8, 0.0),
    "clap": lambda c: (s_clap(), 0.7, -0.15),
    "reel_tap": lambda c: (s_reel_tap(), 0.8, -0.1),
    "fiber": lambda c: (s_fiber(c.get("i", 0)), 0.75, -0.25 + 0.2 * c.get("i", 0)),
    "snap_slow": lambda c: (s_snap_slow(), 1.0, -0.1),
    "snow_brush": lambda c: (s_snow_brush(), 0.7, 0.0),
    "reel_lift": lambda c: (s_reel_lift(), 0.8, 0.0),
    "bus_far": lambda c: (s_bus_far(), 0.6, -0.6),
    "giggle": lambda c: (s_shimmer(2.0), 0.35, 0.1),
    "step": lambda c: (s_step(int(c["t"] * 37), c.get("surface", "grass")), c.get("vel", 0.6), c.get("pan", 0.0)),
    "flutter_bed": lambda c: (s_flutter_bed(c.get("dur", 4.0), c.get("amp", 0.6), int(c["t"] * 7)), 0.8, -0.2),
    "string_taut": lambda c: (s_string_taut(), 0.8, -0.1),
}


# ---------------- 环境声 ----------------
def bed(tag, seconds, seed):
    rng = np.random.default_rng(seed)
    n = seconds + 2.5

    def piece(src, gain, lp=None, hp=None):
        off = rng.uniform(0, max(0.0, len(src) / SR - n - 1))
        x = loop_to(seg(src, off, off + n + 1), n)
        if lp:
            x = lowpass(x, lp)
        if hp:
            x = highpass(x, hp)
        return norm(x, -6) * db(gain)

    if tag in ("spring", "morning"):
        return piece(BIRDS, -16) + piece(WINDP, -26)
    if tag == "opening":
        return piece(WIND2, -30, lp=900) + piece(BIRDS, -34, lp=3000)
    if tag == "insert":
        return piece(BIRDS, -27, lp=4000) + piece(WIND2, -36, lp=600)
    if tag == "sky":
        return piece(WIND2, -20, hp=300) + piece(WINDP, -26)
    if tag == "summer":
        return piece(CICADA, -19) + piece(BIRDS, -30)
    if tag == "autumn":
        return piece(WINDP, -18) + piece(WIND2, -26, lp=1200) + piece(BIRDS, -32)
    if tag == "winter_wind":
        return piece(WIND2, -11) + piece(WINDP, -16)
    if tag == "winter":
        return piece(WIND2, -21, lp=1500) + piece(WINDP, -27, lp=2000)
    if tag == "thaw":
        x = piece(WIND2, -22, lp=1500)
        u = np.linspace(0, 1, len(x))[:, None]
        return x * (1 - u) + piece(BIRDS, -17) * u
    if tag == "memory":
        return piece(BIRDS, -26, lp=900)
    return zeros(n)[: int(n * SR)] * 0


def main():
    amb = zeros(DUR)
    fx = zeros(DUR)
    shots = [c for c in CUES["cues"] if c["kind"] == "shot"]
    # 合并同类环境声的连续镜头，交叉淡化 1 秒
    runs = []
    for s in shots:
        tag = s.get("amb") or "none"
        if runs and runs[-1][0] == tag:
            runs[-1][2] = s["t"] + s["dur"]
        else:
            runs.append([tag, s["t"], s["t"] + s["dur"]])
    for k, (tag, a, b) in enumerate(runs):
        if tag == "none":
            continue
        x = bed(tag, b - a, seed=k + 3)
        x = fade(x, 1.2, 1.6)
        place(amb, x, max(0.0, a - 0.6))
    # 动作音效
    used = {}
    for c in CUES["cues"]:
        if c["kind"] != "sfx":
            continue
        f = FX.get(c["name"])
        if not f:
            print("缺少音效", c["name"])
            continue
        x, gain, pan = f(c)
        place(fx, x, c["t"], gain, pan)
        used[c["name"]] = used.get(c["name"], 0) + 1
    write(os.path.join(BUILD, "amb.wav"), amb)
    write(os.path.join(BUILD, "fx.wav"), fx)
    print("amb/fx →", BUILD, "音效：", used)


if __name__ == "__main__":
    main()
