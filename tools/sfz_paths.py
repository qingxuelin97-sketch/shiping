#!/usr/bin/env python3
"""列出若干 SFZ 文件引用的全部采样路径（相对 SFZ 所在目录，正斜杠），用于 git 稀疏检出。
用法：python3 -I tools/sfz_paths.py <sfz目录> A.sfz B.sfz ...
"""
import os
import re
import sys


def sfz_samples(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    text = re.sub(r"//[^\n]*", "", text)
    default = ""
    out = []
    for tok in re.finditer(r"(default_path|sample)=([^\n]+?)(?=\s+\w+=|\s*<|\s*$)", text, re.M):
        k, v = tok.group(1), tok.group(2).strip()
        if k == "default_path":
            default = v
        else:
            out.append((default + v).replace("\\", "/"))
    return out


if __name__ == "__main__":
    base = sys.argv[1]
    seen = []
    for name in sys.argv[2:]:
        for p in sfz_samples(os.path.join(base, name)):
            if p not in seen:
                seen.append(p)
    for p in seen:
        print(p)
