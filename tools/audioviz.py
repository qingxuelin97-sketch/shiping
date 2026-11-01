#!/usr/bin/env python3
"""把音轨画成“响度曲线 + 剪辑点 + 卡点”对照图，用来检查音画同步。
用法：audioviz.py out.png track1.wav [track2.wav ...]
"""
import json
import os
import sys

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    out = sys.argv[1]
    tracks = sys.argv[2:]
    cues = json.load(open(os.path.join(ROOT, "build", "cues.json"), encoding="utf-8"))
    dur = cues["duration"] + 1
    W, rowH, pad = 3000, 160, 30
    H = pad * 2 + rowH * len(tracks) + 40
    im = Image.new("RGB", (W, H), (24, 24, 26))
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13)
    except OSError:
        font = ImageFont.load_default()
    X = lambda t: int(pad + (W - 2 * pad) * t / dur)
    for c in cues["cues"]:
        if c["kind"] == "shot":
            d.line([(X(c["t"]), pad), (X(c["t"]), H - 30)], fill=(70, 70, 80), width=1)
            d.text((X(c["t"]) + 2, H - 28), c["name"], fill=(150, 150, 160), font=font)
        if c["kind"] == "music":
            d.text((X(c["t"]) + 2, 6), c["name"], fill=(240, 200, 120), font=font)
            d.line([(X(c["t"]), pad - 6), (X(c["t"]), H - 30)], fill=(150, 120, 60), width=2)
    for k, path in enumerate(tracks):
        x, sr = sf.read(path, always_2d=True)
        m = x.mean(axis=1)
        hop = int(sr * 0.05)
        n = len(m) // hop
        r = np.sqrt((m[: n * hop].reshape(n, hop) ** 2).mean(axis=1) + 1e-12)
        dbv = 20 * np.log10(r)
        y0 = pad + k * rowH
        d.text((pad, y0 + 2), os.path.basename(path), fill=(200, 200, 200), font=font)
        pts = []
        for i, v in enumerate(dbv):
            t = i * 0.05
            y = y0 + rowH - 10 - (np.clip(v, -60, 0) + 60) / 60 * (rowH - 20)
            pts.append((X(t), y))
        d.line(pts, fill=(120, 200, 255), width=1)
        for c in cues["cues"]:
            if c["kind"] == "hit":
                d.line([(X(c["t"]), y0 + 10), (X(c["t"]), y0 + rowH - 10)], fill=(220, 70, 60), width=1)
    im.save(out)
    print(out)


if __name__ == "__main__":
    main()
