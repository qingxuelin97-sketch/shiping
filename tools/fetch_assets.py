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


# ---- v2：采样库（git 稀疏检出，只取用到的乐器）----
VSCO_SFZ = ["ViolinEnsSusVib.sfz", "ViolaEnsSusVib.sfz", "CelloEnsSusVib.sfz", "ContrabassSusVB.sfz", "SViolinVib.sfz",
            "FluteSusVib.sfz", "FluteExpVib.sfz", "Harp.sfz", "Glockenspiel.sfz", "Timpani.sfz", "CelloEnsPizz.sfz", "ViolinEnsPizz.sfz"]
REPOS = [
    # (目录, 仓库, 分支, 作者, 许可, 用途)
    ("samples/vsco2", "https://github.com/sgossner/VSCO-2-CE", "SFZ", "Versilian Studios (Sam Gossner)", "CC0 1.0",
     "弦乐组、独奏小提琴（二胡）、长笛（笛、箫）、竖琴、钟琴、定音鼓、拨弦"),
    ("samples/salamander", "https://github.com/sfzinstruments/SalamanderGrandPiano", None, "Alexander Holm", "CC-BY 3.0",
     "钢琴（取 v4/v7/v10/v13 四个力度层）"),
]


def git(*args, cwd=None):
    import subprocess
    subprocess.run(["git", *args], cwd=cwd, check=True)


def sparse_repo(rel, url, branch, patterns_fn):
    dest = os.path.join(ASSETS, rel)
    if not os.path.isdir(os.path.join(dest, ".git")):
        cmd = ["clone", "--filter=blob:none", "--no-checkout", "--depth", "1"]
        if branch:
            cmd += ["-b", branch]
        git(*cmd, url, dest)
        git("config", "gc.auto", "0", cwd=dest)
        git("sparse-checkout", "init", "--no-cone", cwd=dest)
    # 第一步只检出说明文件与 SFZ，再按 SFZ 引用的采样补全
    with open(os.path.join(dest, ".git", "info", "sparse-checkout"), "w") as f:
        f.write("/LICENSE\n/README.md\n/*.sfz\n")
    git("read-tree", "-mu", "HEAD", cwd=dest)
    pats = patterns_fn(dest)
    with open(os.path.join(dest, ".git", "info", "sparse-checkout"), "w") as f:
        f.write("/LICENSE\n/README.md\n/*.sfz\n" + "".join("/" + p + "\n" for p in pats))
    git("read-tree", "-mu", "HEAD", cwd=dest)
    return dest


def vsco_patterns(dest):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from sfz_paths import sfz_samples
    import subprocess
    tree = subprocess.run(["git", "ls-tree", "-r", "--name-only", "HEAD"], cwd=dest, capture_output=True, text=True, check=True).stdout.split("\n")
    low = {t.lower(): t for t in tree if t}
    out = []
    for name in VSCO_SFZ:
        for p in sfz_samples(os.path.join(dest, name)):
            q = low.get(p.lower())
            if q and q not in out:
                out.append(q)
    return out


def salamander_patterns(dest):
    notes = ["A0", "C1", "D#1", "F#1"]
    for o in range(1, 8):
        notes += [f"A{o}", f"C{o + 1}", f"D#{o + 1}", f"F#{o + 1}"]
    notes = [n for n in notes if n not in ("D#8", "F#8")]
    return [f"Samples/{n}v{v}.flac" for n in notes for v in (4, 7, 10, 13)]


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
    for (rel, url, branch, author, lic, use), fn in zip(REPOS, (vsco_patterns, salamander_patterns)):
        print("git  ", rel)
        dest = sparse_repo(rel, url, branch, fn)
        n = sum(1 for _, _, fs in os.walk(dest) for x in fs if x.lower().endswith((".wav", ".flac")))
        out.append({"path": rel, "url": url, "page": url, "author": author, "license": lic, "use": use, "files": n})
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("manifest:", manifest_path, len(out), "items")


if __name__ == "__main__":
    sys.exit(main())
