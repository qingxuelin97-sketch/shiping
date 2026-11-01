#!/usr/bin/env python3
"""从 Make Me a Hanzi 的 graphics.txt（Arphic 公共许可）里只抽出片中要书写的字，
存成 film/src/type/strokes.js（ES 模块）：{字: {strokes: [SVG 路径], medians: [[[x,y],...]]}}。
坐标是 1024×1024 的字框，y 轴朝上（显示时用 y' = 900 - y）。
用法：python3 -I tools/extract_strokes.py assets/hanzi/graphics.txt
"""
import json
import os
import sys

CHARS = "纸鸢儿童散学归来早忙趁东风放"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    src = sys.argv[1]
    want = set(CHARS)
    out = {}
    with open(src, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            ch = d.get("character")
            if ch in want and ch not in out:
                strokes = [str(s) for s in d["strokes"]]
                medians = [[[int(p[0]), int(p[1])] for p in m] for m in d["medians"]]
                # 只允许 SVG 路径里出现的字符
                for s in strokes:
                    assert set(s) <= set("MQLCZ0123456789 -."), ch
                out[ch] = {"strokes": strokes, "medians": medians}
    missing = want - set(out)
    if missing:
        print("缺字：", "".join(sorted(missing)))
    dst = os.path.join(ROOT, "film", "src", "type", "strokes.js")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "w", encoding="utf-8") as f:
        f.write("// 由 tools/extract_strokes.py 从 Make Me a Hanzi 的 graphics.txt 抽取。\n")
        f.write("// graphics.txt 源自 Arphic PL KaitiM GB / Arphic PL UKai，依 Arphic Public License 分发（见同目录 ARPHICPL.TXT）。\n")
        f.write("export default ")
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(dst, len(out), "字", {k: len(v["strokes"]) for k, v in out.items()})


if __name__ == "__main__":
    main()
