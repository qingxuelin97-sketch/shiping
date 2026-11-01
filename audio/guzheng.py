#!/usr/bin/env python3
"""物理建模古筝：扩展 Karplus–Strong 拨弦 + 琴体共鸣，外加古筝技法
   按音（拨后把音推高）、滑音、揉弦、摇指（快速轮拨）、刮奏（五声音阶上的扫弦）。

    g = Guzheng()
    y = g.note(key=62, vel=90, dur=2.0, press=2, press_at=0.35)   # 立体声 float32 @ 48k
"""
import numpy as np
from scipy import signal

SR = 48000


def _f0(key):
    return 440.0 * 2 ** ((key - 69) / 12)


class Guzheng:
    def __init__(self, gain_db=0.0, seed=3):
        self.gain = 10 ** (gain_db / 20)
        self.rng = np.random.default_rng(seed)
        # 琴体：几处木腔共鸣峰
        self.body = []
        for fc, q, g in [(170, 4.0, 0.9), (330, 5.0, 0.7), (720, 6.0, 0.45), (1500, 5.0, 0.2), (3100, 4.0, 0.1)]:
            b, a = signal.iirpeak(fc, q, fs=SR)
            self.body.append((b, a, g))

    def _string(self, f0, n, vel, bright, pos, t60):
        P = SR / f0
        # 环内不做小数延迟插值（线性插值是低通，会把高音弦很快闷掉）：取整数周期，
        # 音高误差交给 note() 里的重采样修正。对称三点低通（延迟 1 样本）让高次谐波衰减更快。
        N = max(2, int(round(P)) - 1)
        self.f_act = SR / (N + 1)
        sm = float(np.clip(0.08 * (220 / f0) ** 2, 0.002, 0.12))
        h = np.array([sm, 1 - 2 * sm, sm, 0.0])
        g = 10 ** (-3 * (N + 1) / (SR * t60))
        # 激励：拨弦时琴弦的初始形状——在拨弦点隆起的三角形（谐波按 1/n² 衰减），
        # 叠一点经低通的噪声做出指甲的毛糙感；力度越大越亮
        L = N + 1
        d = max(1, int(pos * L))
        tri = np.concatenate([np.linspace(0, 1, d, endpoint=False), np.linspace(1, 0, L - d)])
        nz = self.rng.uniform(-1, 1, L)
        cut = np.clip(f0 * (6 + 22 * bright * (0.3 + 0.7 * vel)), 600, 15000)
        b, aa = signal.butter(1, cut / (SR / 2))
        nz = signal.lfilter(b, aa, nz)
        tri = tri - tri.mean()
        vel_ex = np.diff(np.concatenate([[0.0], tri]))
        rms = lambda q: np.sqrt((q ** 2).mean()) + 1e-9
        beta = 0.2 + 0.35 * vel * bright  # 位移激励（暗）与速度激励（亮）按力度混合
        ex = (1 - beta) * tri / rms(tri) + beta * vel_ex / rms(vel_ex) + nz / rms(nz) * (0.1 + 0.15 * vel)
        ex *= 0.35
        x = np.zeros(n + N + 2)
        x[N + 1:N + 1 + L] = ex[: max(0, min(L, n))]
        x = np.concatenate([np.zeros(3), x])
        y = np.zeros(len(x))
        # 逐周期向量化：每一段只依赖至少一个周期以前的样本
        start = N + 4
        while start < len(x):
            end = min(start + N, len(x))
            idx = np.arange(start, end)
            y[idx] = x[idx] + g * (h[0] * y[idx - N] + h[1] * y[idx - N - 1] + h[2] * y[idx - N - 2] + h[3] * y[idx - N - 3])
            start = end
        return y[N + 4:]

    def pluck(self, key, vel=80, dur=2.0, bright=0.6, pos=0.13):
        f0 = _f0(key)
        v = np.clip(vel / 127, 0.05, 1)
        # 低音弦余音长，高音弦短
        t60 = float(np.interp(key, [38, 62, 86, 98], [7.0, 4.2, 2.2, 1.4]))
        n = int((dur + 0.02) * SR)
        y = self._string(f0, n, v, bright, pos, t60)
        # 指甲拨弦的“嚓”：几毫秒的高频噪声
        k = int(0.006 * SR)
        click = self.rng.uniform(-1, 1, k) * np.exp(-np.linspace(0, 6, k))
        bh, ah = signal.butter(2, 2500 / (SR / 2), "high")
        click = signal.lfilter(bh, ah, click) * 0.25 * v
        y[:k] += click
        # 琴体共鸣
        body = np.zeros_like(y)
        for b, a, g in self.body:
            body += signal.lfilter(b, a, y) * g
        y = y * 0.75 + body * 0.35
        bh, ah = signal.butter(2, 50 / (SR / 2), "high")
        y = signal.lfilter(bh, ah, y)
        return y * v ** 1.3

    def note(self, key, vel=80, dur=2.0, press=0.0, press_at=0.3, press_time=0.18, slide=0.0, slide_time=0.15,
             vib=0.0, vib_rate=5.0, vib_at=0.35, release=None, bright=0.6, pan=None):
        """一个音：先按定音高合成，再用随时间变化的重采样做按音、滑音、揉弦。"""
        tail = release if release is not None else float(np.interp(key, [38, 62, 86], [3.5, 2.4, 1.4]))
        total = dur + tail
        y = self.pluck(key, vel, total * 1.15 + 0.1, bright=bright)
        n = int(total * SR)
        t = np.arange(n) / SR
        # 整数周期带来的音高误差，在这里一并修正
        cents = np.full(n, 1200 * np.log2(_f0(key) / self.f_act))
        if slide:
            k = np.clip(t / slide_time, 0, 1)
            cents += slide * 100 * (1 - k) ** 2
        if press:
            k = np.clip((t - press_at) / press_time, 0, 1)
            cents += press * 100 * (k * k * (3 - 2 * k))
        if vib:
            k = np.clip((t - vib_at) / 0.3, 0, 1)
            cents += vib * k * np.sin(2 * np.pi * vib_rate * np.maximum(0, t - vib_at))
        if np.any(np.abs(cents) > 0.01):
            ratio = 2 ** (cents / 1200)
            pos = np.concatenate([[0.0], np.cumsum(ratio[:-1])])
            pos = np.minimum(pos, len(y) - 2)
            i = pos.astype(np.int64)
            f = pos - i
            y = y[i] * (1 - f) + y[i + 1] * f
        else:
            y = y[:n]
        # 止音：按住时长之后再响一会儿（手掌轻按止音）
        env = np.ones(n)
        nd = int(dur * SR)
        if n > nd:
            k = np.linspace(0, 1, n - nd)
            env[nd:] = np.exp(-4 * k) * (1 - k)
        # 起音处 1.5 毫秒的淡入：去掉数字上的跳变（咔哒声），拨弦的清脆不受影响
        kf = int(0.0015 * SR)
        env[:kf] *= np.sin(np.linspace(0, np.pi / 2, kf)) ** 2
        # 各音区响度拉平（低音弦能量大，高音弦小）
        lev = float(np.interp(key, [45, 50, 62, 74, 86, 93], [2.1, -0.2, -4.5, -10.0, -14.4, -16.9]))
        y = y * env * self.gain * 10 ** ((-12 - lev) / 20)
        # 声像：低音偏左、高音偏右，另一声道微小延迟增加宽度
        p = np.clip((key - 62) / 40, -0.45, 0.45) if pan is None else pan
        l, r = np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)
        d = int(0.0004 * SR)
        right = np.concatenate([np.zeros(d), y[:-d]])
        return np.stack([y * l, right * r], axis=1).astype(np.float32)

    def tremolo(self, key, vel, dur, rate=13.0, swell=None):
        """摇指：同一根弦上快速轮拨。返回 (偏移秒, 音) 列表由调用方摆放。"""
        out = []
        k = 0
        t = 0.0
        while t < dur:
            v = vel * (0.82 + 0.18 * np.sin(k * 1.7)) * (swell(t / dur) if swell else 1.0)
            out.append((t, self.note(key, v, 1.0 / rate * 1.6, release=0.5 if t + 1 / rate < dur else 2.0, bright=0.5)))
            t += 1.0 / rate * (1 + 0.06 * np.sin(k * 2.3))
            k += 1
        return out


PENTA_D = [2, 4, 6, 9, 11]  # D 宫五声：D E F# A B


def gliss_keys(lo, hi, down=False, scale=PENTA_D):
    keys = [k for k in range(lo, hi + 1) if k % 12 in scale]
    return keys[::-1] if down else keys
