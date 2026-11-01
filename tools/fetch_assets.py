#!/usr/bin/env python3
"""下载《纸鸢》用到的第三方素材，并把来源、作者、许可和 sha256 写进 assets/manifest.json。

用法：python3 -I tools/fetch_assets.py
已经下载过且校验一致的文件会跳过。所有素材都只作为数据读取（字体、音频），不会被执行。
"""
import hashlib
import json
import os
import sys
import urllib.request
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")

GF = "https://raw.githubusercontent.com/google/fonts/main/ofl"
OGA = "https://opengameart.org/sites/default/files"

# (目标路径, 下载地址, 来源页面, 作者, 许可, 用途)
ITEMS = [
    # ---- 字体（SIL Open Font License 1.1）----
    ("fonts/MaShanZheng-Regular.ttf", f"{GF}/mashanzheng/MaShanZheng-Regular.ttf",
     "https://fonts.google.com/specimen/Ma+Shan+Zheng", "Ma Shan Zheng", "OFL-1.1", "片名、印章"),
    ("fonts/MaShanZheng-OFL.txt", f"{GF}/mashanzheng/OFL.txt", "", "", "OFL-1.1", "许可文本"),
    ("fonts/ZhiMangXing-Regular.ttf", f"{GF}/zhimangxing/ZhiMangXing-Regular.ttf",
     "https://fonts.google.com/specimen/Zhi+Mang+Xing", "Wei Zhimang", "OFL-1.1", "题诗、题献（行书）"),
    ("fonts/ZhiMangXing-OFL.txt", f"{GF}/zhimangxing/OFL.txt", "", "", "OFL-1.1", "许可文本"),
    ("fonts/ZCOOLXiaoWei-Regular.ttf", f"{GF}/zcoolxiaowei/ZCOOLXiaoWei-Regular.ttf",
     "https://fonts.google.com/specimen/ZCOOL+XiaoWei", "ZCOOL", "OFL-1.1", "片尾字幕（中文）"),
    ("fonts/ZCOOLXiaoWei-OFL.txt", f"{GF}/zcoolxiaowei/OFL.txt", "", "", "OFL-1.1", "许可文本"),
    ("fonts/CormorantGaramond.ttf", f"{GF}/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf",
     "https://fonts.google.com/specimen/Cormorant+Garamond", "Christian Thalmann", "OFL-1.1", "英文字幕"),
    ("fonts/CormorantGaramond-Italic.ttf", f"{GF}/cormorantgaramond/CormorantGaramond-Italic%5Bwght%5D.ttf",
     "https://fonts.google.com/specimen/Cormorant+Garamond", "Christian Thalmann", "OFL-1.1", "英文字幕（斜体）"),
    ("fonts/CormorantGaramond-OFL.txt", f"{GF}/cormorantgaramond/OFL.txt", "", "", "OFL-1.1", "许可文本"),
    # ---- 音色库 ----
    ("soundfont/GeneralUser-GS.sf2", "https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2",
     "https://www.schristiancollins.com/generaluser", "S. Christian Collins", "GeneralUser GS License v2.0（可自由用于音乐创作，含商用）", "配乐音色"),
    ("soundfont/GeneralUser-GS-LICENSE.txt", "https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/documentation/LICENSE.txt",
     "", "", "", "许可文本"),
    # ---- 音效（OpenGameArt，CC0）----
    ("sfx/wind_background_noise_2.wav", f"{OGA}/wind%20background%20noise%202.wav",
     "https://opengameart.org/content/mild-wind-background-noise", "bashar3a", "CC0", "四季风声底"),
    ("sfx/short_wind_sound.wav", f"{OGA}/short%20wind%20sound.wav",
     "https://opengameart.org/content/short-wind-sound", "remaxim", "CC0", "阵风"),
    ("sfx/park_ambience_birds.wav", f"{OGA}/park_ambience_birds.wav",
     "https://opengameart.org/content/park-ambiences", "thimras", "CC0", "春天鸟鸣环境声"),
    ("sfx/park_ambience_wind.wav", f"{OGA}/park_ambience_wind.wav",
     "https://opengameart.org/content/park-ambiences", "thimras", "CC0", "树叶风声环境声"),
    ("sfx/birds-isaiah658.ogg", f"{OGA}/birds-isaiah658_0.ogg",
     "https://opengameart.org/content/ambient-bird-sounds", "isaiah658", "CC0", "鸟鸣"),
    ("sfx/birdchirping071414.wav", f"{OGA}/birdchirping071414.wav",
     "https://opengameart.org/content/bird-chirping-sounds", "syncopika", "CC0", "鸟鸣点缀"),
    ("sfx/cicadas_1.ogg", f"{OGA}/082526-cicadasounds_0.ogg",
     "https://opengameart.org/content/cicada-sounds", "syncopika", "CC0", "夏天蝉鸣"),
    ("sfx/cicadas_2.ogg", f"{OGA}/082526-cicadasounds2_0.ogg",
     "https://opengameart.org/content/cicada-sounds", "syncopika", "CC0", "夏天蝉鸣"),
    ("sfx/SnowWalk.zip", f"{OGA}/SnowWalk.zip",
     "https://opengameart.org/content/walking-on-snow-sound", "ignasd", "CC0", "雪地脚步"),
    ("sfx/engine_sound.mp3", f"{OGA}/engine_sound.mp3",
     "https://opengameart.org/content/engine-sounds2", "pauliuw", "CC0", "汽车引擎"),
]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url, dest):
    tmp = dest + ".part"
    req = urllib.request.Request(url, headers={"User-Agent": "paper-kite-asset-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    os.replace(tmp, dest)


def safe_extract(zpath, outdir):
    """解压 zip，拒绝绝对路径和 .. 路径。"""
    os.makedirs(outdir, exist_ok=True)
    with zipfile.ZipFile(zpath) as z:
        for info in z.infolist():
            name = info.filename.replace("\\", "/")
            if name.startswith("/") or ".." in name.split("/") or info.is_dir():
                continue
            target = os.path.join(outdir, *name.split("/"))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with z.open(info) as src, open(target, "wb") as dst:
                dst.write(src.read())


def main():
    manifest_path = os.path.join(ASSETS, "manifest.json")
    old = {}
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            old = {e["path"]: e for e in json.load(f)}
    out = []
    for rel, url, page, author, lic, use in ITEMS:
        dest = os.path.join(ASSETS, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        known = old.get(rel)
        if os.path.exists(dest) and known and known.get("sha256") == sha256(dest):
            print("ok   ", rel)
        else:
            print("fetch", rel)
            download(url, dest)
        if rel.endswith(".zip"):
            safe_extract(dest, dest[:-4])
        out.append({"path": rel, "url": url, "page": page, "author": author, "license": lic,
                    "use": use, "bytes": os.path.getsize(dest), "sha256": sha256(dest)})
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("manifest:", manifest_path, len(out), "items")


if __name__ == "__main__":
    sys.exit(main())
