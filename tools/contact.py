#!/usr/bin/env python3
"""把一组静帧拼成带时间码的联系表。用法：contact.py list.json out.png [cols]"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont


def main():
    items = json.load(open(sys.argv[1], encoding="utf-8"))
    out = sys.argv[2]
    cols = int(sys.argv[3]) if len(sys.argv) > 3 else 6
    ims = [Image.open(i["f"]).convert("RGB") for i in items]
    w, h = ims[0].size
    pad, lab = 6, 22
    rows = (len(ims) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (w + pad) + pad, rows * (h + pad + lab) + pad), (30, 30, 30))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
    except OSError:
        font = ImageFont.load_default()
    for k, (im, it) in enumerate(zip(ims, items)):
        r, c = divmod(k, cols)
        x = pad + c * (w + pad)
        y = pad + r * (h + pad + lab)
        sheet.paste(im, (x, y + lab))
        t = it["t"]
        d.text((x + 2, y + 3), f"{int(t // 60)}:{t % 60:05.2f}", fill=(230, 230, 230), font=font)
    sheet.save(out)


if __name__ == "__main__":
    main()
