#!/usr/bin/env python3
"""混音：配乐 + 环境声 + 音效 → 软限幅 → ffmpeg loudnorm 两遍 → build/audio/final.wav（-16 LUFS，真峰值 ≤ -1.5 dBTP）"""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from lib import SR, BUILD, db, write, peak_db, rms_db  # noqa: E402

GAINS = {"score.wav": 0.0, "amb.wav": -1.0, "fx.wav": -1.5}


def main():
    tracks = {}
    n = 0
    for name in GAINS:
        x, sr = sf.read(os.path.join(BUILD, name), always_2d=True, dtype="float32")
        assert sr == SR
        tracks[name] = x * db(GAINS[name])
        n = max(n, len(x))
        print(f"{name:10s} peak {peak_db(x):6.1f} dBFS  rms {rms_db(x):6.1f} dBFS")
    mix = np.zeros((n, 2), np.float32)
    for x in tracks.values():
        mix[: len(x)] += x
    # 软限幅：-1 dBFS 以上平滑压缩
    th = db(-3.0)
    a = np.abs(mix)
    over = a > th
    mix[over] = np.sign(mix[over]) * (th + (1 - th) * np.tanh((a[over] - th) / (1 - th)))
    pre = os.path.join(BUILD, "premix.wav")
    write(pre, mix)
    # loudnorm 第一遍：测量
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", pre, "-af", "loudnorm=I=-16:TP=-1.5:LRA=14:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True)
    txt = r.stderr
    js = json.loads(txt[txt.rindex("{"): txt.rindex("}") + 1])
    print("测得：", {k: js[k] for k in ("input_i", "input_tp", "input_lra")})
    out = os.path.join(BUILD, "final.wav")
    af = ("loudnorm=I=-16:TP=-1.5:LRA=14:linear=true:"
          f"measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:"
          f"measured_thresh={js['input_thresh']}:offset={js['target_offset']}:print_format=summary")
    subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", pre, "-af", af, "-ar", str(SR), "-c:a", "pcm_s24le", out],
                   check=True, capture_output=True)
    print("final →", out)


if __name__ == "__main__":
    main()
