#!/usr/bin/env python3
"""《纸鸢》原创配乐：代码作曲，按剪辑点卡点，用 GeneralUser GS 音色渲染。

一个“纸鸢主题”（D 宫调五声音阶）贯穿全片：
  M1 序与扎风筝 → M2 初飞与片名 → M3 四季与离家（转 B 羽调）→ M4 冬（主题停在最后一个音之前；线断处音乐完全停下）
  → M5 春又来（闪回引用主题）→ M6 再飞（主题第一次完整落回主音）→ M7 片尾。
用法：python3 -I audio/score.py   输出 build/audio/score.wav
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
import tinysoundfont  # noqa: E402
from lib import SR, ASSETS, BUILD, load_cues, reverb, write, lowpass, peak_db  # noqa: E402

SF2 = os.path.join(ASSETS, "soundfont", "GeneralUser-GS.sf2")
NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def m(n):
    i, acc = 1, 0
    if n[1] == "#":
        acc, i = 1, 2
    elif n[1] == "b":
        acc, i = -1, 2
    return 12 * (int(n[i:]) + 1) + NOTE[n[0]] + acc


INST = {  # 名称: (通道, 音色, 音量) —— 音量按单音实测响度校准，旋律乐器略高于伴奏
    "koto": (0, 107, 98), "flute": (1, 73, 118), "xiao": (2, 77, 108), "harp": (3, 46, 92), "pad": (4, 49, 100),
    "pizz": (5, 45, 110), "piano": (6, 0, 118), "celesta": (7, 8, 94), "violin": (8, 40, 104), "cello": (10, 42, 86),
    "choir": (11, 52, 104), "timp": (12, 47, 86), "bass": (13, 43, 96), "glock": (14, 9, 116), "mbox": (15, 10, 90),
    "drum": (9, None, 64),
}
VIB = {"violin": 0.32, "xiao": 0.16, "flute": 0.12}
PENTA = {2, 4, 6, 9, 11}

EV = []  # (时间, 顺序, 类型, 参数)
RNG = np.random.default_rng(2026)


def ch(inst):
    return INST[inst][0]


def note(inst, t, d, key, vel=70, slide=0.0):
    vel = int(np.clip(vel, 1, 127))
    c = ch(inst)
    t = max(0.0, t)
    d = max(0.05, d)
    if inst in VIB:
        depth = VIB[inst]
        rng = 2.0
        # 起音时的滑音（二胡式）
        if slide:
            n = 8
            for k in range(n + 1):
                v = slide * (1 - k / n)
                EV.append((t + k * 0.012, 0, "bend", (c, int(8192 + v / rng * 8191))))
        else:
            EV.append((t, 0, "bend", (c, 8192)))
        if d > 0.45:
            t0 = t + 0.22
            k = 0
            while t0 + k / 50 < t + d:
                tt = t0 + k / 50
                ramp = min(1.0, (tt - t0) / 0.35)
                v = depth * ramp * np.sin(2 * np.pi * 5.4 * (tt - t0))
                EV.append((tt, 0, "bend", (c, int(8192 + v / rng * 8191))))
                k += 1
    EV.append((t, 2, "on", (c, key, vel)))
    EV.append((t + d, 1, "off", (c, key)))


def cc(inst, t, ctl, val):
    EV.append((t, 0, "cc", (ch(inst), ctl, int(np.clip(val, 0, 127)))))


def swell(inst, t0, t1, v0, v1, rate=25):
    n = max(2, int((t1 - t0) * rate))
    for k in range(n + 1):
        u = k / n
        cc(inst, t0 + (t1 - t0) * u, 11, v0 + (v1 - v0) * (0.5 - 0.5 * np.cos(np.pi * u)))


def drum(t, key, vel):
    EV.append((t, 2, "on", (9, key, vel)))
    EV.append((t + 0.3, 1, "off", (9, key)))


def allstop(t):
    EV.append((t, 3, "stop", None))


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

    def n(self, inst, b, d, key, vel=70, human=True, slide=0.0):
        t0, t1 = self.T(b), self.T(b + d)
        if human:
            t0 += RNG.normal(0, 0.007)
            vel += int(RNG.integers(-5, 6))
        note(inst, t0, t1 - t0, key, vel, slide)

    def mel(self, inst, b, seq, vel=70, legato=0.96, shift=0, slide=0.0, cresc=0):
        k = 0
        for name, d in seq:
            if name:
                sl = slide * (1 if k % 2 else -1) if slide else 0.0
                self.n(inst, b, d * legato, m(name) + shift, vel + cresc * k, slide=sl)
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
            self.n(inst, b + i * step, ring, k, vel, human=False)

    def roll(self, inst, b, key, d, v0, v1, rate=12):
        n = int(d * rate)
        for k in range(n):
            self.n(inst, b + k / rate, 0.2, m(key), v0 + (v1 - v0) * k / max(1, n - 1), human=False)


def mel_abs(inst, t, seq, vel=70, slide=0.0):
    for name, d in seq:
        if name:
            note(inst, t, d * 0.97, m(name), vel, slide)
        t += d
    return t


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


# 羽调（B 小调五声）版本：同一组音，乐句落在 B 上
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
KOTO = {  # 古筝式分解和弦
    "D": ["D4", "A4", "D5", "E5", "F#5", "E5", "D5", "A4"],
    "Bm": ["B3", "F#4", "B4", "D5", "E5", "D5", "B4", "F#4"],
    "G": ["G3", "D4", "G4", "A4", "B4", "A4", "G4", "D4"],
    "A": ["A3", "E4", "A4", "B4", "D5", "B4", "A4", "E4"],
    "Em": ["E4", "B4", "E5", "F#5", "G5", "F#5", "E5", "B4"],
}
BASS = {"D": "D2", "Bm": "B1", "G": "G1", "A": "A1", "Em": "E2", "Dadd9": "D2", "Bm7": "B1", "F#m": "F#1"}
PROG = ["D", "Bm", "G", "A", "D", "Bm", "G", "A"]


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
    note("koto", drop, 3.0, m("A5"), 72)
    note("harp", drop + 0.02, 3.5, m("D6"), 46)
    Cue([(0, drop + 0.3), (1, drop + 0.6)]).gliss("harp", 0, "D3", "A5", 8.5, vel=44, ring=4.0)
    for k, nm in enumerate(["D3", "A3", "F#4"]):
        note("pad", t0 + 2.6 + k * 0.2, 7.8 - k * 0.2, m(nm), 44)
    swell("pad", t0 + 2.6, t0 + 6.0, 20, 96)
    p1 = H("S01", "poem1")
    t = mel_abs("xiao", p1, [("A4", 1.1), ("B4", 0.55), ("D5", 0.55), ("B4", 1.0), ("A4", 1.5)], 74, slide=0.4)
    mel_abs("xiao", t, [("F#4", 1.0), ("E4", 0.5), ("D4", 2.4)], 70, slide=0.4)

    # S02 山坡全景：古筝分解和弦 + 笛子主题
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

    # S05 递线拐子：温暖的弦乐 + 笛子收在主音（交接那一刻）
    c = Cue([(0, S("S05") + 0.4), (6, H("S05", "handover")), (10, S("S06"))])
    c.gliss("harp", -0.6, "D4", "A6", 1.2, vel=52, ring=2.5)
    c.chord("pad", 0, HARM["G"], 2.05, 58)
    c.chord("pad", 2, HARM["A"], 2.05, 60)
    c.chord("pad", 4, HARM["D"], 6.0, 62)
    c.n("bass", 0, 2, m("G1"), 56)
    c.n("bass", 2, 2, m("A1"), 58)
    c.n("bass", 4, 6, m("D2"), 60)
    c.mel("flute", 0, bars(6, 8), 78)
    c.arp("piano", 4, ["D4", "A4", "D5", "F#5", "A5"], 0.5, 5, 50, ring=4)


# ---------------- M2 初飞 · 片名 ----------------
RUN = [("D4", .25), ("E4", .25), ("F#4", .25), ("A4", .25), ("B4", .25), ("A4", .25), ("F#4", .25), ("E4", .25)]


def launch_music(t_start, t_crash, t_release, t_next, title=None):
    c = Cue([(0, t_start), (4, t_crash), (10, t_release)])
    c.mel("pizz", 0, RUN + RUN, 66, cresc=1)
    c.mel("koto", 0, [("D5", 1), ("E5", 1), ("F#5", 1), ("A5", 1)], 60)
    # 栽跟头
    c.n("timp", 4, 1.0, m("D2"), 78, human=False)
    c.mel("pizz", 4, [("D5", .25), ("B4", .25), ("A4", .25), ("F#4", .25), ("D4", .5)], 72)
    drum(c.T(4), 45, 70)
    # 托起风筝：颤音弦乐渐强
    for nm in ["A2", "E3", "A3", "D4"]:
        c.n("pad", 5, 5.1, m(nm), 52, human=False)
    swell("pad", c.T(5), c.T(10), 30, 110)
    c.arp("harp", 7.5, ["A3", "D4", "E4", "A4", "B4", "D5", "E5", "A5"], 0.25, 10, 50, ring=2.0)
    c.n("flute", 8.5, 1.5, m("A4"), 56)
    return c


def m2():
    launch_music(S("S06"), H("S06", "crash"), H("S06", "release"), S("S07"))
    rel = H("S06", "release")
    c = Cue([(10, rel), (26, S("S08")), (29, H("S08", "title")), (32, H("S08", "seal")), (36, S("S09")), (44, S("S10"))])
    swell("pad", rel, rel + 0.5, 110, 100)
    c.gliss("harp", 9.6, "D4", "D6", 0.9, vel=64, ring=3.0)
    c.roll("timp", 9.2, "D2", 1.0, 30, 80)
    drum(c.T(10), 57, 58)
    c.mel("flute", 10, bars(0, 4), 84)
    c.mel("violin", 10, bars(0, 4), 64, shift=-12, slide=0.5)
    accomp(c, 10, PROG[:4], "pad bass koto", 58)
    # 片名：上行到 D 大加九和弦
    c.mel("flute", 26, bars(4, 5)[:4], 86)
    c.chord("pad", 29, HARM["Dadd9"], 3.2, 74)
    c.chord("choir", 29, ["D4", "F#4", "A4", "E5"], 4.0, 70)
    c.n("bass", 29, 4, m("D2"), 74)
    c.roll("timp", 28, "D2", 1.0, 30, 90)
    c.gliss("harp", 28.8, "D3", "A6", 1.4, vel=62, ring=4.0)
    drum(c.T(29), 49, 46)
    c.mel("flute", 29, [("D5", 3)], 80)
    # 印章
    c.n("koto", 32, 2.5, m("A5"), 82, human=False)
    c.n("glock", 32, 2.5, m("A6"), 58, human=False)
    c.arp("harp", 32, ["D4", "A4", "D5", "F#5", "A5", "D6"], 0.5, 8, 46, ring=3.5)
    c.chord("pad", 32, HARM["D"], 4.1, 52)
    # S09 祖孙并坐：笛子收在主音
    c.mel("flute", 36, bars(6, 8), 66)
    c.chord("pad", 36, HARM["G"], 2.0, 46)
    c.chord("pad", 38, HARM["A"], 2.0, 46)
    c.chord("pad", 40, HARM["D"], 4.2, 46)
    c.arp("koto", 40, KOTO["D"], 0.5, 8, 52, ring=3.0)


# ---------------- M3 夏 · 补丁 · 秋 · 离家 · 三个春天 ----------------
def m3():
    snag = H("S10", "snag")
    c = Cue([(0, S("S10")), (6, snag), (10, S("S11")), (14, H("S11", "swallow_mark")), (18, S("S12")),
             (26, H("S12", "proud")), (30, S("S13")), (36, H("S13", "wave")), (46, S("S14A")), (62, S("S15"))])
    # 夏：钢琴主题
    c.mel("piano", 0, bars(0, 1) + [("F#4", 1.5), ("E4", .5)], 72)
    c.arp("piano", 0, ["D3", "A3", "D4", "A3"], 0.5, 12, 48, ring=1.5)
    c.chord("pad", 0, HARM["D"], 6.0, 44)
    # 挂破：古筝弯音 + 拨弦“扑通”
    note("koto", snag, 1.2, m("B4"), 86)
    for k in range(10):
        EV.append((snag + 0.05 + k * 0.03, 0, "bend", (ch("koto"), 8192 - k * 700)))
    EV.append((snag + 1.3, 0, "bend", (ch("koto"), 8192)))
    c.mel("pizz", 6.2, [("A4", .25), ("F#4", .25), ("D4", .5)], 70)
    c.mel("piano", 7, [("E3", 1), ("D3", 2)], 46)
    # 补丁：温柔的钢琴
    c.mel("piano", 10, [("A4", 1), ("F#4", 1), ("E4", 1), ("D4", 1)], 60)
    c.chord("piano", 10, ["D3", "A3"], 4, 44)
    c.mel("celesta", 14, [("A5", .5), ("D6", 1.5)], 66)
    c.n("harp", 14, 3, m("D6"), 50)
    c.mel("piano", 14, [("E4", 1), ("F#4", 1), ("A4", 1), ("B4", 1)], 58)
    c.chord("piano", 14, ["G2", "D3", "B3"], 4, 42)
    # 秋：笛子 + 竖琴
    c.mel("flute", 18, bars(4, 6), 76)
    accomp(c, 18, ["D", "Bm"], "pad harp", 50)
    c.mel("flute", 26, bars(7, 8), 80)
    c.chord("pad", 26, HARM["A"], 1.0, 52)
    c.chord("pad", 27, HARM["D"], 3.2, 56)
    c.gliss("harp", 26, "D4", "D6", 1.0, vel=52)
    # 离家：转 B 羽调，大提琴与钢琴
    c.mel("cello", 30, [("B3", 2), ("A3", 1), ("F#3", 1), ("B3", 2)], 70, slide=0.3)
    c.chord("piano", 30, ["B2", "F#3", "D4"], 3, 46)
    c.chord("piano", 33, ["G2", "D3", "B3"], 3, 44)
    c.chord("pad", 36, HARM["G"], 4.0, 58)
    swell("pad", c.T(36), c.T(38), 60, 110)
    c.n("flute", 36, 3.5, m("B5"), 62)
    c.mel("piano", 38, [("D5", 1), ("B4", 1), ("A4", 1), ("F#4", 1), ("E4", 2), ("D4", 1), ("B3", 1)], 54)
    c.chord("pad", 40, HARM["Em"], 3.0, 50)
    c.chord("pad", 43, HARM["Bm"], 3.2, 46)
    swell("pad", c.T(40), c.T(46), 100, 50)
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
def m4():
    snap = H("S15", "snap")
    c = Cue([(0, S("S15")), (8, snap)])
    c.n("cello", 0, 8, m("B1"), 52, human=False)
    c.n("bass", 0, 8, m("F#2"), 40, human=False)
    swell("cello", c.T(0), c.T(2), 30, 100)
    c.mel("violin", 0.5, [("F#4", 1.5), ("E4", .5), ("D4", 1), ("B3", 1), ("A3", 1.5), ("B3", .5), ("D4", 1.5)], 70, slide=0.7)
    for nm in ["B2", "F#3", "B3"]:
        c.n("pad", 5.5, 2.5, m(nm), 50, human=False)
    swell("pad", c.T(5.5), c.T(8), 20, 120)
    allstop(snap)
    t0 = S("S16") + 2.2
    c = Cue([(0, t0), (16, S("S16") + 16.2)])
    c.mel("violin", 0, TH_MIN[:9], 64, slide=0.8)
    c.mel("violin", 8, TH_MIN[9:], 60, slide=0.8)
    c.n("cello", 6, 10, m("B1"), 40)
    c.n("pad", 8, 8, m("B3"), 34)
    c.n("pad", 8, 8, m("F#3"), 30)


# ---------------- M5 春又来：雪化梨花、发现、闪回、结、重描 ----------------
def m5():
    t = S("S17")
    c = Cue([(0, t), (12, S("S18")), (22, S("S19")), (24, H("S19", "point")), (30, H("S19", "patch")), (33, S("S20A")),
             (35, H("S20A", "recognize")), (37, S("S20B")), (40, S("S20C")), (43, S("S21A")), (51, H("S21B", "knot")),
             (55, H("S21C", "peek")), (58, S("S22"))])
    # 梨花次第开：钢片琴与竖琴由疏到密
    sparse = ["D5", "A5", "E5", "B5", "F#5", "D6"]
    for k in range(6):
        c.n("celesta", k * 0.75, 2.5, m(sparse[k]), 50 + k * 3)
    c.gliss("harp", 1.5, "D4", "A5", 1.5, vel=48, ring=3)
    c.arp("celesta", 4.5, ["D5", "F#5", "A5", "B5", "D6", "B5", "A5", "F#5"], 0.5, 7, 54, ring=2.0)
    c.arp("harp", 8, ["D4", "A4", "D5", "E5", "F#5", "A5", "B5", "D6"], 0.25, 16, 52, ring=2.5)
    c.chord("pad", 2, HARM["D"], 10.0, 40)
    swell("pad", c.T(2), c.T(11), 30, 100)
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
    launch_music(S("S22"), H("S22", "crash"), H("S22", "release"), S("S23"))
    rel = H("S22", "release")
    c = Cue([(10, rel), (26, S("S24")), (34, S("S25")), (40, H("S25", "fade")), (46, S("S26"))])
    swell("pad", rel, rel + 0.5, 110, 100)
    c.gliss("harp", 9.6, "D4", "D6", 0.9, vel=66, ring=3.0)
    c.roll("timp", 9.2, "D2", 1.0, 30, 84)
    drum(c.T(10), 57, 60)
    c.mel("flute", 10, bars(0, 4), 88)
    c.mel("violin", 10, bars(0, 4), 70, shift=-12, slide=0.5)
    c.mel("choir", 10, [("D4", 4), ("B3", 4), ("G3", 4), ("A3", 4)], 50)
    accomp(c, 10, PROG[:4], "pad bass koto harp", 60)
    c.n("glock", 18, 2.0, m("D6"), 56)
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
    swell("pad", c.T(41), c.T(46), 110, 40)
    swell("choir", c.T(41), c.T(46), 110, 30)


# ---------------- M7 题献与片尾：古筝独奏 ----------------
def m7():
    c = Cue([(0, S("S26") + 0.6), (4, S("S27")), (32, END - 2.6)])
    c.mel("koto", 0, bars(0, 1), 70)
    c.mel("koto", 4, bars(1, 8), 68)
    accomp(c, 4, ["Bm", "G", "A", "D", "Bm", "G", "A"], "pad", 38)
    c.arp("harp", 8, ["D4", "A4", "D5", "F#5"], 1.0, 20, 36, ring=3.0)
    c.n("harp", 32, 2.5, m("D6"), 50, human=False)
    c.chord("pad", 32, HARM["D"], 2.5, 40)


def render(total):
    syn = tinysoundfont.Synth(samplerate=SR, gain=-4)
    sfid = syn.sfload(SF2)
    for name, (c, prog, vol) in INST.items():
        if prog is None:
            syn.program_select(c, sfid, 128, 0, True)
        else:
            syn.program_select(c, sfid, 0, prog)
        syn.control_change(c, 7, vol)
        syn.control_change(c, 11, 127)
        syn.pitchbend_range(c, 2.0)
    ev = sorted(EV, key=lambda e: (e[0], e[1]))
    N = int(total * SR)
    out = np.zeros((N, 2), np.float32)
    pos, i = 0, 0
    while pos < N:
        t = pos / SR
        while i < len(ev) and ev[i][0] <= t + 1e-9:
            _, _, kind, a = ev[i]
            if kind == "on":
                syn.noteon(*a)
            elif kind == "off":
                syn.noteoff(*a)
            elif kind == "cc":
                syn.control_change(*a)
            elif kind == "bend":
                syn.pitchbend(a[0], int(np.clip(a[1], 0, 16383)))
            elif kind == "stop":
                syn.sounds_off()
            i += 1
        nxt = int(np.ceil(ev[i][0] * SR)) if i < len(ev) else N
        n = max(1, min(nxt - pos, N - pos, SR))
        out[pos:pos + n] = np.frombuffer(syn.generate(n), np.float32).reshape(-1, 2)
        pos += n
    return out


def main():
    for f in (m1, m2, m3, m4, m5, m6, m7):
        f()
    total = END + 1.0
    dry = render(total)
    wet = reverb(dry, wet=0.34, seconds=3.0, seed=11)
    # 闪回段：闷化 + 更远的混响
    a, b = S("S20B"), S("S20C") + 0.4
    i0, i1 = int(a * SR), int(b * SR)
    muff = reverb(lowpass(wet[i0:i1], 1600, 2), wet=0.5, seconds=2.2, seed=3)
    w = np.ones(i1 - i0, np.float32)
    r = int(0.4 * SR)
    w[:r] = np.linspace(0, 1, r)
    w[-r:] = np.linspace(1, 0, r)
    wet[i0:i1] = wet[i0:i1] * (1 - w[:, None]) + muff * w[:, None]
    # 线断：连混响尾巴一起切掉
    snap = H("S15", "snap")
    j0, j1 = int(snap * SR), int((S("S16") + 2.0) * SR)
    g = np.ones(len(wet), np.float32)
    k = int(0.04 * SR)
    g[j0:j0 + k] = np.linspace(1, 0, k)
    g[j0 + k:j1] = 0
    wet *= g[:, None]
    wet *= 10 ** ((-3.0 - peak_db(wet)) / 20)
    write(os.path.join(BUILD, "score.wav"), wet)
    print("score →", os.path.join(BUILD, "score.wav"), f"{len(EV)} events, {total:.1f}s, peak {peak_db(wet):.1f} dBFS")


if __name__ == "__main__":
    main()
