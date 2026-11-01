#!/usr/bin/env python3
"""《纸鸢》原创配乐 v2：代码作曲，按剪辑点卡点，分轨用真实采样与物理建模渲染。

一个“纸鸢主题”（D 宫调五声音阶）贯穿全片：
  M1 序与扎风筝 → M2 初飞与片名 → M3 四季与离家（转 B 羽调）→ M4 冬（主题停在最后一个音之前；线断处音乐完全停下）
  → M5 春又来（闪回引用主题）→ M6 再飞（主题第一次完整落回主音）→ M7 片尾。
v2：古筝为物理建模（按音、滑音、揉弦、摇指、刮奏）；二胡由独奏小提琴采样加滑音与揉弦扮演；
    笛、箫由长笛采样加气声与倚音扮演；弦乐、竖琴、钢琴、钟琴、定音鼓为真实采样；M3、M6 加大提琴对位旋律。
用法：python3 -I audio/score.py   输出 build/audio/score.wav（另存分轨 build/audio/stems/）
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from lib import SR, BUILD, load_cues, write, lowpass, highpass, bandpass, peak_db, noise, reverb  # noqa: E402
from engine import SRC, pan2, place, peq, woodblock, cymbal, gm_track, hall_ir, convolve_st, vibrato, glide, combine  # noqa: E402
from guzheng import gliss_keys  # noqa: E402

NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def m(n):
    i, acc = 1, 0
    if n[1] == "#":
        acc, i = 1, 2
    elif n[1] == "b":
        acc, i = -1, 2
    return 12 * (int(n[i:]) + 1) + NOTE[n[0]] + acc


PENTA = {2, 4, 6, 9, 11}
NOTES = []   # dict(inst, t, d, key, vel, slide, opt)
AUTO = {}    # inst -> [(t, v)]，力度起伏（0..127）
PERC = []    # (t, kind, vel, opt)
RNG = np.random.default_rng(2026)


def note(inst, t, d, key, vel=70, slide=0.0, **opt):
    NOTES.append({"inst": inst, "t": max(0.0, t), "d": max(0.05, d), "key": int(key), "vel": float(np.clip(vel, 1, 127)), "slide": slide, "opt": opt})


def swell(inst, t0, t1, v0, v1, rate=25):
    n = max(2, int((t1 - t0) * rate))
    pts = AUTO.setdefault(inst, [])
    for k in range(n + 1):
        u = k / n
        pts.append((t0 + (t1 - t0) * u, v0 + (v1 - v0) * (0.5 - 0.5 * np.cos(np.pi * u))))


def drum(t, key, vel):
    # 76 木鱼；45 低鼓（用定音鼓）；49/57 吊镲
    if key == 76:
        PERC.append((t, "wood", vel, {}))
    elif key == 45:
        note("timp", t, 1.2, m("D2"), vel)
    else:
        PERC.append((t, "cym", vel * 0.8, {}))


def cym_swell(t_peak, seconds, vel=60):
    PERC.append((t_peak - seconds, "cym_swell", vel, {"swell": seconds}))


class Cue:
    """锚点 [(拍, 秒)] 之间线性插值：剪辑点落在指定的拍上，拍与拍之间自然渐快渐慢。"""

    def __init__(self, anchors):
        self.A = anchors

    def T(self, b):
        A = self.A
        if b <= A[0][0]:
            (b0, t0), (b1, t1) = A[0], A[1]
            return t0 + (b - b0) * (t1 - t0) / (b1 - b0)
        for (b0, t0), (b1, t1) in zip(A, A[1:]):
            if b <= b1:
                return t0 + (b - b0) * (t1 - t0) / (b1 - b0)
        (b0, t0), (b1, t1) = A[-2], A[-1]
        return t1 + (b - b1) * (t1 - t0) / (b1 - b0)

    def n(self, inst, b, d, key, vel=70, human=True, slide=0.0, **opt):
        t0, t1 = self.T(b), self.T(b + d)
        if human:
            t0 += RNG.normal(0, 0.007)
            vel += int(RNG.integers(-5, 6))
        note(inst, t0, t1 - t0, key, vel, slide, **opt)

    def mel(self, inst, b, seq, vel=70, legato=0.96, shift=0, slide=0.0, cresc=0, **opt):
        k = 0
        for name, d in seq:
            if name:
                sl = slide * (1 if k % 2 else -1) if slide else 0.0
                self.n(inst, b, d * legato, m(name) + shift, vel + cresc * k, slide=sl, **opt)
                k += 1
            b += d
        return b

    def chord(self, inst, b, names, d, vel=60, roll=0.0, shift=0):
        for i, nm in enumerate(names):
            self.n(inst, b + i * roll, d - i * roll, m(nm) + shift, vel, human=False)

    def arp(self, inst, b, names, step, count, vel=60, ring=1.6, pattern=None, shift=0):
        idx = pattern or list(range(len(names)))
        for k in range(count):
            nm = names[idx[k % len(idx)]]
            self.n(inst, b + k * step, step * ring, m(nm) + shift, vel - (k % 2) * 6)

    def gliss(self, inst, b, lo, hi, d, vel=60, down=False, ring=3.0):
        keys = [k for k in range(m(lo), m(hi) + 1) if k % 12 in PENTA]
        if down:
            keys = keys[::-1]
        step = d / max(1, len(keys))
        for i, k in enumerate(keys):
            self.n(inst, b + i * step, ring, k, vel * (0.75 + 0.25 * i / max(1, len(keys) - 1)), human=False)

    def roll(self, inst, b, key, d, v0, v1, rate=12):
        n = int(d * rate)
        for k in range(n):
            self.n(inst, b + k / rate, 0.2, m(key), v0 + (v1 - v0) * k / max(1, n - 1), human=False)

    def trem(self, b, key, d, vel=60):
        """古筝摇指：长音上的快速轮拨"""
        t0, t1 = self.T(b), self.T(b + d)
        note("koto", t0, t1 - t0, m(key) if isinstance(key, str) else key, vel, trem=True)


def mel_abs(inst, t, seq, vel=70, slide=0.0):
    for name, d in seq:
        if name:
            note(inst, t, d * 0.97, m(name), vel, slide)
        t += d
    return t


def zgliss(t, lo, hi, dur, vel=62, down=False):
    """古筝刮奏：五声音阶上的扫弦，落在 t+dur"""
    keys = gliss_keys(m(lo), m(hi), down)
    step = dur / max(1, len(keys))
    for i, k in enumerate(keys):
        note("koto", t + i * step, 1.6, k, vel * (0.7 + 0.3 * i / max(1, len(keys) - 1)), bright=0.75)


# ---------------- 主题与和声 ----------------
TH = [
    ("A4", 1), ("B4", .5), ("D5", .5), ("B4", 1), ("A4", 1),
    ("F#4", 1.5), ("E4", .5), ("D4", 2),
    ("E4", 1), ("F#4", .5), ("A4", .5), ("B4", 1), ("A4", .5), ("F#4", .5),
    ("E4", 3), (None, 1),
    ("A4", 1), ("B4", .5), ("D5", .5), ("E5", 1), ("D5", 1),
    ("B4", 1.5), ("A4", .5), ("B4", 1), ("D5", 1),
    ("E5", 1), ("D5", .5), ("B4", .5), ("A4", 1), ("F#4", 1),
    ("E4", 1), ("F#4", 1), ("D4", 2),
]


def bars(a, b, seq=TH):
    out, beat = [], 0.0
    for nm, d in seq:
        if a * 4 <= beat < b * 4:
            out.append((nm, d))
        beat += d
    return out


TH_MIN = [
    ("F#4", 1), ("A4", .5), ("B4", .5), ("A4", 1), ("F#4", 1),
    ("E4", 1.5), ("D4", .5), ("B3", 2),
    ("D4", 1), ("E4", .5), ("F#4", .5), ("A4", 1), ("F#4", .5), ("E4", .5),
    ("E4", 4),
]
HARM = {
    "D": ["D3", "A3", "D4", "F#4"], "Bm": ["B2", "F#3", "B3", "D4"], "G": ["G2", "D3", "G3", "B3"],
    "A": ["A2", "E3", "A3", "D4"], "Em": ["E3", "B3", "E4", "G4"], "Dadd9": ["D3", "A3", "E4", "F#4", "A4"],
    "Bm7": ["B2", "F#3", "A3", "D4"], "F#m": ["F#2", "C#3", "F#3", "A3"],
}
KOTO = {
    "D": ["D4", "A4", "D5", "E5", "F#5", "E5", "D5", "A4"],
    "Bm": ["B3", "F#4", "B4", "D5", "E5", "D5", "B4", "F#4"],
    "G": ["G3", "D4", "G4", "A4", "B4", "A4", "G4", "D4"],
    "A": ["A3", "E4", "A4", "B4", "D5", "B4", "A4", "E4"],
    "Em": ["E4", "B4", "E5", "F#5", "G5", "F#5", "E5", "B4"],
}
BASS = {"D": "D2", "Bm": "B1", "G": "G1", "A": "A1", "Em": "E2", "Dadd9": "D2", "Bm7": "B1", "F#m": "F#1"}
PROG = ["D", "Bm", "G", "A", "D", "Bm", "G", "A"]
# 大提琴对位：在主题下面走一条反向的线（M3、M6）
COUNTER = [("D3", 2), ("E3", 1), ("F#3", 1), ("G3", 2), ("F#3", 1), ("E3", 1),
           ("D3", 2), ("B2", 2), ("A2", 3), ("C#3", 1),
           ("D3", 2), ("F#3", 1), ("A3", 1), ("B3", 2), ("A3", 1), ("G3", 1),
           ("F#3", 2), ("E3", 2), ("A2", 2), ("D3", 2)]


def accomp(c, b0, chords, style="pad", vel=55):
    for i, chd in enumerate(chords):
        b = b0 + i * 4
        if "pad" in style:
            c.chord("pad", b, HARM[chd], 4.05, vel)
        if "bass" in style:
            c.n("bass", b, 3.9, m(BASS[chd]), vel + 5)
        if "koto" in style:
            c.arp("koto", b, KOTO[chd if chd in KOTO else "D"], 0.5, 8, vel + 8, ring=2.2)
        if "harp" in style:
            c.arp("harp", b, HARM[chd] + [HARM[chd][1]], 1.0, 4, vel, ring=3.0, shift=12)
        if "piano" in style:
            c.arp("piano", b, [HARM[chd][0], HARM[chd][1], HARM[chd][2], HARM[chd][1]], 1.0, 4, vel, ring=2.5)
        if "pizz" in style:
            c.arp("pizz", b, [HARM[chd][0], HARM[chd][1], HARM[chd][2], HARM[chd][1]], 0.5, 8, vel, ring=0.6)


# ---------------- 读剪辑点 ----------------
CUES = load_cues()
SHOT = {c["name"]: c["t"] for c in CUES["cues"] if c["kind"] == "shot"}
HIT = {(c.get("shot"), c["name"]): c["t"] for c in CUES["cues"] if c["kind"] == "hit"}
END = CUES["duration"]


def S(i):
    return SHOT[i]


def H(shot, name):
    return HIT[(shot, name)]


# ---------------- M1 序 · 扎风筝 · 递线拐子 ----------------
def m1():
    t0 = S("S01")
    note("bass", t0 + 0.0, 9.8, m("D2"), 46)
    note("cello", t0 + 0.3, 9.4, m("A2"), 40)
    swell("bass", t0, t0 + 3.0, 25, 105)
    swell("cello", t0, t0 + 3.0, 25, 100)
    drop = t0 + 0.95
    note("koto", drop, 3.0, m("A5"), 80)
    note("harp", drop + 0.02, 3.5, m("D6"), 46)
    Cue([(0, drop + 0.3), (1, drop + 0.6)]).gliss("harp", 0, "D3", "A5", 8.5, vel=44, ring=4.0)
    for k, nm in enumerate(["D3", "A3", "F#4"]):
        note("pad", t0 + 2.6 + k * 0.2, 7.8 - k * 0.2, m(nm), 44)
    swell("pad", t0 + 2.6, t0 + 6.0, 20, 96)
    p1 = H("S01", "poem1")
    t = mel_abs("xiao", p1, [("A4", 1.1), ("B4", 0.55), ("D5", 0.55), ("B4", 1.0), ("A4", 1.5)], 74, slide=0.4)
    mel_abs("xiao", t, [("F#4", 1.0), ("E4", 0.5), ("D4", 2.4)], 70, slide=0.4)

    # S02 山坡全景：古筝刮奏引入，分解和弦 + 笛子主题
    zgliss(S("S02") - 0.9, "D4", "A5", 0.8, 58)
    c = Cue([(0, S("S02")), (8, S("S02") + 6.6)])
    c.arp("koto", 0, KOTO["D"], 0.5, 8, 62, ring=2.4)
    c.arp("koto", 4, KOTO["Bm"], 0.5, 8, 60, ring=2.4)
    c.arp("koto", 8, KOTO["G"], 0.5, 4, 56, ring=3.0)
    c.mel("flute", 0, bars(0, 2), 74)
    c.chord("pad", 0, HARM["D"], 4.0, 42)
    c.chord("pad", 4, HARM["Bm"], 4.0, 40)
    c.chord("pad", 8, HARM["G"], 2.4, 36)

    # S03–S04 扎风筝：拨弦、木鱼、古筝的小动机
    c = Cue([(0, S("S03")), (20, H("S04", "peek")), (26, S("S05"))])
    for b in range(0, 26):
        c.n("pizz", b, 0.35, m("D3") if b % 2 == 0 else m("A3"), 60 + (b % 4 == 0) * 8)
        if 2 <= b < 20 and b % 2 == 1:
            c.n("pizz", b + 0.5, 0.3, m("F#3"), 44)
    for b in range(4, 20):
        if b % 2 == 1:
            drum(c.T(b), 76, 50)
    craft1 = [("D5", .5), ("E5", .5), ("F#5", .5), ("A5", .5), ("F#5", 1), ("E5", 1)]
    craft2 = [("D5", .5), ("B4", .5), ("A4", 1), ("B4", .5), ("D5", .5), ("E5", 1)]
    craft3 = [("A4", .5), ("B4", .5), ("D5", .5), ("E5", .5), ("D5", .5), ("B4", .5), ("A4", 1)]
    c.mel("koto", 4, craft1, 70)
    c.mel("koto", 8, craft2, 66)
    c.mel("koto", 12, craft1, 70, shift=-12)
    c.mel("koto", 16, craft3, 68)
    c.mel("flute", 8, [("A5", 2), ("F#5", 2)], 50)
    c.mel("celesta", 20, [("A5", .25), ("B5", .25), ("D6", .25), ("E6", .25), ("F#6", 1.5)], 72)
    c.n("glock", 20, 2.0, m("E6"), 60)
    c.mel("koto", 21, craft2, 62)
    c.chord("pad", 20, HARM["D"], 6.0, 38)

    # S05 递线拐子：温暖的弦乐，笛子在特写里线拐子落进小手的那一刻收在主音
    ho = H("S05B", "handover")
    c = Cue([(0, S("S05") + 0.4), (6, ho), (10, S("S06"))])
    c.gliss("harp", -0.6, "D4", "A6", 1.2, vel=52, ring=2.5)
    c.chord("pad", 0, HARM["G"], 2.05, 58)
    c.chord("pad", 2, HARM["A"], 2.05, 60)
    c.chord("pad", 4, HARM["D"], 6.0, 62)
    swell("pad", c.T(4), ho, 80, 118)
    c.n("bass", 0, 2, m("G1"), 56)
    c.n("bass", 2, 2, m("A1"), 58)
    c.n("bass", 4, 6, m("D2"), 60)
    c.mel("flute", 0, bars(6, 8), 78)
    # 交到手里：古筝泛音一样的高音、钟琴、竖琴
    note("koto", ho, 3.0, m("D6"), 70, bright=0.4)
    note("glock", ho + 0.01, 2.5, m("A6"), 54)
    c.arp("piano", 6, ["D4", "A4", "D5", "F#5", "A5"], 0.5, 5, 50, ring=4)


# ---------------- M2 初飞 · 片名 ----------------
RUN = [("D4", .25), ("E4", .25), ("F#4", .25), ("A4", .25), ("B4", .25), ("A4", .25), ("F#4", .25), ("E4", .25)]


def launch_music(t_start, t_crash, t_release):
    c = Cue([(0, t_start), (4, t_crash), (10, t_release)])
    c.mel("pizz", 0, RUN + RUN, 66, cresc=1)
    c.mel("koto", 0, [("D5", 1), ("E5", 1), ("F#5", 1), ("A5", 1)], 60)
    # 栽跟头
    c.n("timp", 4, 1.0, m("D2"), 78, human=False)
    c.mel("pizz", 4, [("D5", .25), ("B4", .25), ("A4", .25), ("F#4", .25), ("D4", .5)], 72)
    # 托起风筝：弦乐渐强
    for nm in ["A2", "E3", "A3", "D4"]:
        c.n("pad", 5, 5.1, m(nm), 52, human=False)
    swell("pad", c.T(5), c.T(10), 30, 110)
    c.arp("harp", 7.5, ["A3", "D4", "E4", "A4", "B4", "D5", "E5", "A5"], 0.25, 10, 50, ring=2.0)
    c.n("flute", 8.5, 1.5, m("A4"), 56)
    cym_swell(t_release, 1.6, 56)
    zgliss(c.T(9.3), "D4", "D6", c.T(10) - c.T(9.3), 64)
    return c


def m2():
    launch_music(S("S06"), H("S06", "crash"), H("S06", "release"))
    rel = H("S06", "release")
    c = Cue([(10, rel), (26, S("S08")), (29, H("S08", "title")), (32, H("S08", "seal")), (36, S("S09")), (44, S("S10"))])
    swell("pad", rel, rel + 0.5, 110, 100)
    c.gliss("harp", 9.6, "D4", "D6", 0.9, vel=64, ring=3.0)
    c.roll("timp", 9.2, "D2", 1.0, 30, 80)
    c.mel("flute", 10, bars(0, 4), 84)
    c.mel("violin", 10, bars(0, 4), 62, shift=-12, slide=0.5)
    accomp(c, 10, PROG[:4], "pad bass koto", 58)
    # 片名：上行到 D 大加九和弦
    c.mel("flute", 26, bars(4, 5)[:4], 86)
    c.chord("pad", 29, HARM["Dadd9"], 3.2, 74)
    c.chord("choir", 29, ["D4", "F#4", "A4", "E5"], 4.0, 70)
    c.n("bass", 29, 4, m("D2"), 74)
    c.roll("timp", 28, "D2", 1.0, 30, 90)
    c.gliss("harp", 28.8, "D3", "A6", 1.4, vel=62, ring=4.0)
    zgliss(c.T(28.4), "A3", "D6", c.T(29) - c.T(28.4), 66)
    cym_swell(c.T(29), 1.8, 50)
    c.mel("flute", 29, [("D5", 3)], 80)
    # 印章
    c.n("koto", 32, 2.5, m("A5"), 82, human=False)
    c.n("glock", 32, 2.5, m("A6"), 58, human=False)
    c.arp("harp", 32, ["D4", "A4", "D5", "F#5", "A5", "D6"], 0.5, 8, 46, ring=3.5)
    c.chord("pad", 32, HARM["D"], 4.1, 52)
    # S09 祖孙并坐：笛子收在主音，古筝摇指托着
    c.mel("flute", 36, bars(6, 8), 66)
    c.chord("pad", 36, HARM["G"], 2.0, 46)
    c.chord("pad", 38, HARM["A"], 2.0, 46)
    c.chord("pad", 40, HARM["D"], 4.2, 46)
    c.trem(40, "A4", 3.6, 46)


# ---------------- M3 夏 · 补丁 · 秋 · 离家 · 三个春天 ----------------
def m3():
    snag = H("S10", "snag")
    c = Cue([(0, S("S10")), (6, snag), (10, S("S11")), (14, H("S11", "swallow_mark")), (18, S("S12")),
             (26, H("S12", "proud")), (30, S("S13")), (36, H("S13", "wave")), (40, S("S13B")), (43, S("S13C")),
             (46, S("S14A")), (62, S("S15"))])
    # 夏：钢琴主题
    c.mel("piano", 0, bars(0, 1) + [("F#4", 1.5), ("E4", .5)], 72)
    c.arp("piano", 0, ["D3", "A3", "D4", "A3"], 0.5, 12, 48, ring=1.5)
    c.chord("pad", 0, HARM["D"], 6.0, 44)
    # 挂破：古筝按音往下一沉 + 拨弦“扑通”
    note("koto", snag, 1.2, m("B4"), 88, press=-1.0, press_at=0.06, press_time=0.25)
    c.mel("pizz", 6.2, [("A4", .25), ("F#4", .25), ("D4", .5)], 70)
    c.mel("piano", 7, [("E3", 1), ("D3", 2)], 46)
    # 补丁：温柔的钢琴
    c.mel("piano", 10, [("A4", 1), ("F#4", 1), ("E4", 1), ("D4", 1)], 60)
    c.chord("piano", 10, ["D3", "A3"], 4, 44)
    c.mel("celesta", 14, [("A5", .5), ("D6", 1.5)], 66)
    c.n("harp", 14, 3, m("D6"), 50)
    c.mel("piano", 14, [("E4", 1), ("F#4", 1), ("A4", 1), ("B4", 1)], 58)
    c.chord("piano", 14, ["G2", "D3", "B3"], 4, 42)
    # 秋：笛子 + 竖琴，大提琴在下面对位
    c.mel("flute", 18, bars(4, 6), 76)
    accomp(c, 18, ["D", "Bm"], "pad harp", 50)
    c.mel("cello", 18, COUNTER[:6], 54, slide=0.2)
    c.mel("flute", 26, bars(7, 8), 80)
    c.chord("pad", 26, HARM["A"], 1.0, 52)
    c.chord("pad", 27, HARM["D"], 3.2, 56)
    c.gliss("harp", 26, "D4", "D6", 1.0, vel=52)
    zgliss(c.T(25.4), "D4", "B5", c.T(26) - c.T(25.4), 60)
    # 离家：转 B 羽调，大提琴与钢琴
    c.mel("cello", 30, [("B3", 2), ("A3", 1), ("F#3", 1), ("B3", 2)], 70, slide=0.3)
    c.chord("piano", 30, ["B2", "F#3", "D4"], 3, 46)
    c.chord("piano", 33, ["G2", "D3", "B3"], 3, 44)
    c.chord("pad", 36, HARM["G"], 4.0, 58)
    swell("pad", c.T(36), c.T(38), 60, 110)
    c.n("flute", 36, 3.5, m("B5"), 62)
    c.mel("piano", 38, [("D5", 1), ("B4", 1)], 54)
    # 特写：挥着的手慢慢放下——二胡一句长音，笑容淡去处落下来
    c.mel("violin", 40, [("F#5", 1.6), ("E5", .4), ("D5", 1), ("B4", 2.5)], 70, slide=0.9)
    c.mel("cello", 40, [("G3", 2), ("F#3", 1.5), ("E3", 2.5)], 52, slide=0.2)
    c.chord("pad", 40, HARM["Em"], 3.0, 50)
    c.chord("pad", 43, HARM["Bm"], 3.2, 46)
    swell("pad", c.T(40), c.T(46), 100, 50)
    c.mel("piano", 43, [("E4", 1), ("D4", 1), ("B3", 1)], 46)
    c.n("bass", 30, 6, m("B1"), 52)
    c.n("bass", 36, 4, m("G1"), 52)
    c.n("bass", 40, 6, m("E2"), 46)
    # 三个春天：钢琴独奏，一次比一次稀
    c.mel("piano", 46, bars(0, 2), 62)
    c.chord("piano", 46, ["D2", "A2"], 4, 40)
    c.chord("piano", 50, ["B1", "F#2"], 4, 38)
    c.mel("piano", 54, [("E4", 1), ("F#4", 1), ("A4", 2)], 52)
    c.chord("piano", 54, ["G1", "D2"], 4, 34)
    c.mel("piano", 58, [("B4", 1.5), (None, .5), ("E4", 2)], 44)
    c.chord("piano", 58, ["A1", "E2"], 4, 30)


# ---------------- M4 冬：二胡独奏；线断处戛然而止；雪中主题不落主音 ----------------
SNAP = None


def m4():
    global SNAP
    snap = H("S15B", "snap")
    SNAP = snap
    c = Cue([(0, S("S15")), (8, S("S15B")), (10, snap)])
    c.n("cello", 0, 10, m("B1"), 52, human=False)
    c.n("bass", 0, 10, m("F#2"), 40, human=False)
    swell("cello", c.T(0), c.T(2), 30, 100)
    c.mel("violin", 0.5, [("F#4", 1.5), ("E4", .5), ("D4", 1), ("B3", 1), ("A3", 1.5), ("B3", .5), ("D4", 1.5)], 70, slide=0.7)
    for nm in ["B2", "F#3", "B3"]:
        c.n("pad", 5.5, 4.5, m(nm), 50, human=False)
    swell("pad", c.T(5.5), c.T(10), 20, 120)
    # 慢镜头里：二胡悬在一个高音上，揉弦越来越急
    c.n("violin", 8, 2.2, m("F#5"), 62, human=False, slide=-0.6, vib_depth=55, vib_rate=7.0)
    c.n("glock", 8.4, 1.5, m("B6"), 30, human=False)
    # 线断之后（S15C）：只有风
    t0 = S("S16") + 2.2
    c = Cue([(0, t0), (10, H("S16B", "pickup")), (16, H("S16C", "tilt")), (18, S("S17"))])
    c.mel("violin", 0, TH_MIN[:8], 64, slide=0.8)
    c.n("cello", 0, 10, m("B1"), 40)
    c.n("pad", 2, 8, m("B3"), 30)
    c.n("pad", 2, 8, m("F#3"), 28)
    # 拾起线拐子：古筝一声，二胡接第二句（停在 E，不回主音）
    note("koto", H("S16B", "pickup"), 3.0, m("B4"), 64, vib=18, vib_at=0.5)
    c.mel("violin", 10, [("D4", 1), ("E4", .5), ("F#4", .5), ("A4", 1), ("F#4", .5), ("E4", .5), ("E4", 2.5)], 60, slide=0.8)
    c.n("cello", 10, 8, m("E2"), 38)
    c.chord("pad", 16, ["E3", "B3", "E4"], 3.0, 34)
    c.n("harp", 16, 3.0, m("B5"), 40)


# ---------------- M5 春又来：雪化梨花、发现、闪回、结、重描 ----------------
def m5():
    t = S("S17")
    c = Cue([(0, t), (12, S("S18")), (22, S("S19")), (24, H("S19", "point")), (30, H("S19", "patch")), (33, S("S20A")),
             (35, H("S20A", "recognize")), (37, S("S20B")), (40, S("S20C")), (43, S("S21A")), (51, H("S21B", "knot")),
             (55, H("S21C", "peek")), (58, S("S22"))])
    sparse = ["D5", "A5", "E5", "B5", "F#5", "D6"]
    for k in range(6):
        c.n("celesta", k * 0.75, 2.5, m(sparse[k]), 50 + k * 3)
    c.gliss("harp", 1.5, "D4", "A5", 1.5, vel=48, ring=3)
    c.arp("celesta", 4.5, ["D5", "F#5", "A5", "B5", "D6", "B5", "A5", "F#5"], 0.5, 7, 54, ring=2.0)
    c.arp("harp", 8, ["D4", "A4", "D5", "E5", "F#5", "A5", "B5", "D6"], 0.25, 16, 52, ring=2.5)
    c.chord("pad", 2, HARM["D"], 10.0, 40)
    swell("pad", c.T(2), c.T(11), 30, 100)
    zgliss(c.T(10.5), "D4", "D6", c.T(12) - c.T(10.5), 56)
    # 母女上山：笛子
    c.mel("flute", 12, bars(0, 2), 70)
    accomp(c, 12, ["D", "Bm"], "harp pad", 44)
    c.chord("pad", 20, HARM["G"], 2.0, 40)
    # 发现：拨弦与钢片琴的“疑问”
    c.mel("pizz", 22, [("A4", .5), ("B4", .5), (None, .5), ("D5", .5)], 58)
    c.n("glock", 24, 2.0, m("B5"), 56)
    c.mel("celesta", 24.5, [("B5", .5), ("A5", .5), ("F#5", .5), ("E5", .5), ("D5", 1), ("B4", 2)], 52)
    c.chord("pad", 25, HARM["Bm7"], 5.0, 44)
    swell("pad", c.T(25), c.T(30), 40, 100)
    c.chord("choir", 30, ["B3", "D4", "F#4", "A4"], 3.0, 56)
    c.roll("timp", 29, "B1", 1.2, 20, 60)
    c.chord("pad", 30, HARM["G"], 3.0, 54)
    # 认出风筝
    c.chord("pad", 33, HARM["Bm"], 2.1, 44)
    c.n("violin", 33.2, 1.8, m("F#4"), 52, slide=0.5)
    c.chord("pad", 35, HARM["G"], 2.0, 66)
    swell("pad", c.T(35), c.T(36.5), 70, 120)
    c.mel("violin", 35, [("B4", 1.2), ("A4", .8)], 66, slide=0.6)
    # 闪回：八音盒奏主题（混音时再做闷化）
    c.mel("mbox", 37, [("A5", .375), ("B5", .375), ("D6", .375), ("B5", .375), ("A5", .375), ("F#5", .375), ("E5", .375), ("D5", .375)], 70)
    c.chord("pad", 37, HARM["D"], 3.0, 36)
    # 回到眼前：温暖的大三和弦
    c.chord("pad", 40, HARM["D"], 3.2, 56)
    c.n("flute", 40.3, 2.6, m("D5"), 62)
    # 取风筝、打结、重描
    accomp(c, 43, ["D", "G"], "koto", 48)
    c.mel("flute", 44, [("A4", 1), ("B4", 1), ("D5", 2)], 58)
    c.n("harp", 51, 3, m("D6"), 66, human=False)
    c.n("glock", 51, 3, m("A6"), 58, human=False)
    c.n("celesta", 51.02, 3, m("D6"), 56, human=False)
    c.chord("pad", 51, HARM["D"], 4.0, 46)
    for b in range(51, 58):
        c.n("pizz", b, 0.35, m("D3") if b % 2 else m("A3"), 54)
    c.mel("koto", 52, [("D5", .5), ("E5", .5), ("F#5", .5), ("A5", .5), ("F#5", 1)], 60)
    c.mel("celesta", 55, [("A5", .25), ("B5", .25), ("D6", .25), ("E6", .25), ("F#6", 1)], 70)
    c.roll("timp", 56, "A1", 2.0, 20, 70)
    swell("pad", c.T(56), c.T(58), 60, 110)


# ---------------- M6 再飞：主题第一次完整落回主音 ----------------
def m6():
    launch_music(S("S22"), H("S22", "crash"), H("S22", "release"))
    rel = H("S22", "release")
    c = Cue([(10, rel), (13, S("S22B")), (15.5, S("S23")), (26, S("S24")), (34, S("S25")), (40, H("S25", "fade")), (46, S("S26"))])
    swell("pad", rel, rel + 0.5, 110, 100)
    c.gliss("harp", 9.6, "D4", "D6", 0.9, vel=66, ring=3.0)
    c.roll("timp", 9.2, "D2", 1.0, 30, 84)
    c.mel("flute", 10, bars(0, 4), 88)
    c.mel("violin", 10, bars(0, 4), 66, shift=-12, slide=0.5)
    c.mel("cello", 10, COUNTER, 58, slide=0.15)
    c.mel("choir", 10, [("D4", 4), ("B3", 4), ("G3", 4), ("A3", 4)], 50)
    accomp(c, 10, PROG[:4], "pad bass koto harp", 60)
    # 女儿大笑的特写：古筝刮奏 + 钟琴
    zgliss(c.T(12.6), "D5", "D7", c.T(13) - c.T(12.6), 60)
    c.n("glock", 13, 2.0, m("D6"), 58)
    c.n("glock", 13.5, 2.0, m("A6"), 50)
    # 身影：音乐收薄，箫独奏
    c.mel("xiao", 26, bars(4, 6), 64, slide=0.4)
    for nm in ["D5", "A5"]:
        c.n("pad", 26, 8, m(nm), 34, human=False)
    c.chord("choir", 27, ["D4", "A4"], 6, 34)
    c.mel("celesta", 27, [("D6", .5), ("A5", .5), ("F#6", 2)], 44)
    c.gliss("harp", 30.5, "A4", "A6", 1.2, vel=46, ring=3)
    # 终景：第七、八小节，落在主音
    c.mel("flute", 34, bars(6, 8), 84)
    c.mel("violin", 34, bars(6, 8), 66, shift=-12, slide=0.4)
    c.chord("pad", 34, HARM["G"], 2.05, 60)
    c.chord("pad", 36, HARM["A"], 2.05, 62)
    c.chord("pad", 38, ["E3", "A3", "D4", "E4"], 1.05, 60)
    c.chord("pad", 39, HARM["A"], 1.05, 62)
    c.n("bass", 34, 2, m("G1"), 60)
    c.n("bass", 36, 4, m("A1"), 62)
    c.chord("pad", 40, HARM["Dadd9"], 6.5, 70)
    c.chord("choir", 40, ["D4", "F#4", "A4", "D5"], 6.5, 66)
    c.n("bass", 40, 6.5, m("D2"), 66)
    c.roll("timp", 39.2, "D2", 0.8, 30, 70)
    c.gliss("harp", 40, "D3", "D7", 2.5, vel=56, ring=5)
    zgliss(c.T(39.4), "D3", "A5", c.T(40) - c.T(39.4), 64)
    c.trem(40, "D5", 5.0, 50)
    cym_swell(c.T(40), 1.6, 46)
    swell("pad", c.T(41), c.T(46), 110, 40)
    swell("choir", c.T(41), c.T(46), 110, 30)


# ---------------- M7 题献与片尾：古筝独奏（长音用摇指） ----------------
def m7():
    c = Cue([(0, S("S26") + 0.6), (4, S("S27")), (32, END - 2.6)])
    c.mel("koto", 0, bars(0, 1), 70)
    seq = bars(1, 8)
    b = 4
    for nm, d in seq:
        if nm:
            if d >= 2:
                c.trem(b, nm, d * 0.96, 60)
            else:
                c.n("koto", b, d * 0.96, m(nm), 68)
        b += d
    accomp(c, 4, ["Bm", "G", "A", "D", "Bm", "G", "A"], "pad", 38)
    c.arp("harp", 8, ["D4", "A4", "D5", "F#5"], 1.0, 20, 36, ring=3.0)
    c.n("harp", 32, 2.5, m("D6"), 50, human=False)
    c.chord("pad", 32, HARM["D"], 2.5, 40)


# ---------------- 分轨渲染 ----------------
# 乐器：音源、声像、混响送量、电平（dB，按实测校准后的相对平衡）
TRACKS = {
    "koto": dict(pan=-0.12, send=0.22, gain=5.0),
    "flute": dict(pan=0.06, send=0.26, gain=0.0),
    "xiao": dict(pan=-0.05, send=0.34, gain=6.5),
    "harp": dict(pan=-0.5, send=0.36, gain=-7.0),
    "pad": dict(pan=0.0, send=0.38, gain=0.5),
    "pizz": dict(pan=0.15, send=0.28, gain=-6.0),
    "piano": dict(pan=0.0, send=0.26, gain=0.4),
    "celesta": dict(pan=0.25, send=0.4, gain=14.0),
    "violin": dict(pan=-0.08, send=0.26, gain=-1.0),
    "cello": dict(pan=0.32, send=0.3, gain=12.0),
    "choir": dict(pan=0.0, send=0.45, gain=13.0),
    "timp": dict(pan=0.2, send=0.32, gain=-0.4),
    "bass": dict(pan=0.42, send=0.25, gain=2.0),
    "glock": dict(pan=0.3, send=0.42, gain=-2.0),
    "mbox": dict(pan=0.0, send=0.3, gain=10.0),
    "perc": dict(pan=0.1, send=0.25, gain=-6.0),
}
CALIB_REF = {  # 校准：每种音源一个参考音的目标响度（dBFS RMS）
    "vln": (69, -27), "vla": (60, -27), "vc": (50, -27), "cb": (38, -27), "solo": (69, -22), "fl": (74, -22),
    "flx": (74, -22), "harp": (62, -24), "glock": (84, -26), "timp": (45, -24), "pzv": (69, -26), "pzc": (48, -26),
    "piano": (64, -24),
}


def calib():
    path = os.path.join(BUILD, "calib.json")
    if os.path.exists(path):
        return json.load(open(path))
    out = {}
    for k, (key, target) in CALIB_REF.items():
        y = SRC[k]().note(key, 80, 1.5, release=0.3)
        r = 20 * np.log10(np.sqrt((y[: int(1.5 * SR)] ** 2).mean()) + 1e-9)
        out[k] = float(target - r)
    json.dump(out, open(path, "w"), indent=1)
    return out


def auto_gain(inst, total):
    pts = sorted(AUTO.get(inst, []))
    g = np.ones(int(total * SR), np.float32)
    if not pts:
        return g
    t = np.arange(len(g)) / SR
    tt = np.array([p[0] for p in pts])
    vv = np.clip(np.array([p[1] for p in pts]), 0, 127) / 127.0
    # 没有自动化的时段保持最后的值；第一段之前保持第一个点
    g[:] = np.interp(t, tt, vv) ** 2
    # 设定之前为满（CC11 默认 127）
    g[t < tt[0] - 0.01] = 1.0
    return g


def render_note(inst, nt, cal):
    key, vel, d, sl, opt = nt["key"], nt["vel"], nt["d"], nt["slide"], nt["opt"]
    seed = int(nt["t"] * 1000) % 9973
    if inst == "koto":
        z = SRC["zheng"]()
        if opt.get("trem"):
            parts = z.tremolo(key, vel, d, rate=13.5, swell=lambda u: 0.75 + 0.25 * np.sin(np.pi * min(1, u)))
            n = int((d + 3.0) * SR)
            y = np.zeros((n, 2), np.float32)
            for dt, p in parts:
                place(y, p, dt)
            return y
        return z.note(key, vel, d, press=opt.get("press", 0.0), press_at=opt.get("press_at", 0.3), press_time=opt.get("press_time", 0.18),
                      slide=(sl * 0.6 if sl else 0.0), vib=opt.get("vib", 0.0), vib_at=opt.get("vib_at", 0.35), bright=opt.get("bright", 0.6))
    if inst in ("flute", "xiao"):
        src = "fl" if inst == "flute" else "flx"
        scoop = glide(-45 if sl else -18, 0.09) if inst == "flute" else glide(-70 if sl else -30, 0.14)
        y = SRC[src]().note(key, vel, d, cents=scoop, release=0.28 if inst == "flute" else 0.4, attack=0.03 if inst == "flute" else 0.07)
        y *= 10 ** (cal[src] / 20)
        # 气声：跟着包络的带通噪声
        e = np.sqrt(np.mean(y ** 2, axis=1))
        k = int(0.03 * SR)
        e = np.convolve(e, np.ones(k) / k, mode="same")
        br = bandpass(noise(len(y) / SR + 0.01, seed), 1800 if inst == "xiao" else 2600, 7000)[: len(y)]
        y += br * e[:, None] * (0.55 if inst == "xiao" else 0.28)
        if inst == "xiao":
            y = lowpass(y, 4200, 2)
        return y
    if inst == "violin":
        # 二胡：滑音进音、更深更快的揉弦、鼻音色（中高频提升、低频收）
        vd = opt.get("vib_depth", 32)
        vr = opt.get("vib_rate", 6.0)
        cents = combine(glide(sl * 140 if sl else -25, 0.12 if sl else 0.06), vibrato(vr, vd, delay=0.18, ramp=0.35, seed=seed))
        y = SRC["solo"]().note(key, vel, d, cents=cents, release=0.35, attack=0.04)
        y *= 10 ** (cal["solo"] / 20)
        y = peq(peq(highpass(y, 260, 2), 1500, 5.0, 1.2), 3200, 2.5, 1.5)
        return y
    if inst == "cello":
        cents = combine(glide(sl * 80, 0.1) if sl else None, vibrato(5.2, 10, delay=0.3, seed=seed))
        y = SRC["vc"]().note(key, vel, d, cents=cents, release=0.6, attack=0.08)
        return y * 10 ** (cal["vc"] / 20)
    if inst == "pad":
        src = "vc" if key < 52 else "vla" if key < 60 else "vln"
        y = SRC[src]().note(key, vel, d, release=0.9, attack=0.35)
        return y * 10 ** (cal[src] / 20)
    if inst == "bass":
        y = SRC["cb"]().note(key, vel, d, release=0.8, attack=0.2)
        return y * 10 ** (cal["cb"] / 20)
    if inst == "pizz":
        src = "pzc" if key < 55 else "pzv"
        y = SRC[src]().note(key, vel, min(d, 0.4), release=0.5)
        return y * 10 ** (cal[src] / 20)
    if inst == "harp":
        y = SRC["harp"]().note(key, vel, d, release=1.6)
        return y * 10 ** (cal["harp"] / 20)
    if inst == "glock":
        y = SRC["glock"]().note(key, vel, d, release=1.8)
        return y * 10 ** (cal["glock"] / 20)
    if inst == "timp":
        y = SRC["timp"]().note(key, vel, max(d, 0.6), release=1.8)
        return y * 10 ** (cal["timp"] / 20)
    if inst == "piano":
        y = SRC["piano"]().note(key, vel, d, release=1.4)
        return y * 10 ** (cal["piano"] / 20)
    raise KeyError(inst)


GM = {"celesta": (8, 94), "choir": (52, 96), "mbox": (10, 90)}


def render(total):
    cal = calib()
    os.makedirs(os.path.join(BUILD, "stems"), exist_ok=True)
    N = int(total * SR)
    dry = np.zeros((N, 2), np.float32)
    send = np.zeros((N, 2), np.float32)
    by = {}
    for nt in NOTES:
        by.setdefault(nt["inst"], []).append(nt)
    for inst, lst in sorted(by.items()):
        cfg = TRACKS[inst]
        if inst in GM:
            prog, vol = GM[inst]
            tr = gm_track(lst, total, prog, vol)
        else:
            tr = np.zeros((N, 2), np.float32)
            for nt in lst:
                y = render_note(inst, nt, cal)
                place(tr, y, nt["t"])
        tr *= auto_gain(inst, total)[:, None]
        tr = pan2(tr, cfg["pan"]) * 10 ** (cfg["gain"] / 20)
        dry += tr
        send += tr * cfg["send"]
        write(os.path.join(BUILD, "stems", f"{inst}.wav"), tr)
        print(f"  {inst:8s} {len(lst):4d} 音  峰值 {peak_db(tr):6.1f} dBFS")
    # 打击乐
    pc = np.zeros((N, 2), np.float32)
    for t, kind, vel, opt in PERC:
        if kind == "wood":
            place(pc, woodblock(vel, seed=int(t * 100)), t)
        elif kind == "cym":
            place(pc, cymbal(vel, seconds=4.0, seed=int(t)), t)
        elif kind == "cym_swell":
            place(pc, cymbal(vel, swell=opt["swell"], seconds=opt["swell"] + 3.0, seed=int(t)), t)
    pc = pan2(pc, TRACKS["perc"]["pan"]) * 10 ** (TRACKS["perc"]["gain"] / 20)
    dry += pc
    send += pc * TRACKS["perc"]["send"]
    wet = convolve_st(send, hall_ir(3.2, seed=11))
    return dry, wet


def main():
    for f in (m1, m2, m3, m4, m5, m6, m7):
        f()
    total = END + 1.0
    dry, wet = render(total)
    mix = dry + wet * 0.9
    # 闪回段：闷化 + 更远的混响
    a, b = S("S20B"), S("S20C") + 0.4
    i0, i1 = int(a * SR), int(b * SR)
    muff = reverb(lowpass(mix[i0:i1], 1600, 2), wet=0.5, seconds=2.2, seed=3)
    w = np.ones(i1 - i0, np.float32)
    r = int(0.4 * SR)
    w[:r] = np.linspace(0, 1, r)
    w[-r:] = np.linspace(1, 0, r)
    mix[i0:i1] = mix[i0:i1] * (1 - w[:, None]) + muff * w[:, None]
    # 线断：连混响尾巴一起切掉，直到雪中那一段
    j0, j1 = int(SNAP * SR), int((S("S16") + 2.0) * SR)
    g = np.ones(len(mix), np.float32)
    k = int(0.04 * SR)
    g[j0:j0 + k] = np.linspace(1, 0, k)
    g[j0 + k:j1] = 0
    mix *= g[:, None]
    mix *= 10 ** ((-3.0 - peak_db(mix)) / 20)
    write(os.path.join(BUILD, "score.wav"), mix)
    print("score →", os.path.join(BUILD, "score.wav"), f"{len(NOTES)} 音, {total:.1f}s, 峰值 {peak_db(mix):.1f} dBFS")


if __name__ == "__main__":
    main()
