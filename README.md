# 纸鸢 · The Paper Kite

一部 4 分 25 秒的 2D 水墨卡通动画短片，无对白。

> 会扎风筝的爷爷，每年春天都和孙女小燕在山坡老梨树下放一只沙燕风筝。小燕长大离家，爷爷一年年独自放飞，望着山路等她。爷爷走后，红线断了。多年后，她带着女儿回到树下，用一个结把断掉的红线重新接上。

![海报](output/poster.png)

## 观看

- 成片：[`output/the-paper-kite_1080p.mp4`](output/the-paper-kite_1080p.mp4)（1920×1080，24 fps，H.264 + AAC，-16 LUFS）
- 海报：[`output/poster.png`](output/poster.png)
- 剧照：[`output/stills/`](output/stills/)

## 文档

- [剧本与分镜](docs/剧本与分镜.md)：梗概、人物、镜头表、色彩脚本、声音设计
- [投递材料与导演阐述（草稿）](docs/导演阐述.md)：中英文简介，可修改后用于影展投递
- [素材来源与许可](docs/CREDITS.md)

## 它是怎么做出来的

每一帧画面都由代码绘制，没有手绘逐帧，也没有现成的动画素材。

- **画面**（`film/`）：在 Chromium 里用 Canvas2D 画墨层（笔触库模拟侧锋、飞白、墨点、晕染），再用 WebGL 着色器做水墨后期：边缘手绘感的“呼吸”、墨色洇开、湿边、颜料浓淡、宣纸纹理、暗角。雪、梨花这类比纸更白的颜色走单独的“白粉”层。
- **人物**：一套参数化骨骼，随年龄改变头身比；姿势库加走、跑循环。
- **世界**：远山、云雾、山坡与一棵程序生成的老梨树。四季共用同一副枝干，只换花、叶、雪。所有山坡镜头都来自同一个世界，中景、近景只是推近相机。
- **配乐**（`audio/score.py`）：代码作曲。一个五声音阶主题贯穿七段配乐，按剪辑点卡点，用 GeneralUser GS 音色渲染。
- **声音**（`audio/sfx.py`、`audio/mix.py`）：环境声用 OpenGameArt 的 CC0 实录，动作音效由程序合成，最后做响度标准化。

## 重新渲染

需要 Node.js（含 Playwright 与 Chromium）、Python 3、FFmpeg。

```bash
python3 -I tools/fetch_assets.py              # 下载字体、音色库、音效（记录在 assets/manifest.json）
pip install numpy scipy soundfile Pillow
pip install --no-deps tinysoundfont

node render/stills.mjs --cues build/cues.json # 导出剪辑点
python3 -I audio/score.py                     # 作曲并渲染配乐
python3 -I audio/sfx.py                       # 环境声与音效
python3 -I audio/mix.py                       # 混音 → build/audio/final.wav

node render/render.mjs                        # 1080p 全片画面 → build/video.mp4（4 进程并行）
ffmpeg -i build/video.mp4 -i build/audio/final.wav -c:v copy -c:a aac -b:a 192k -shortest \
  -movflags +faststart output/the-paper-kite_1080p.mp4
```

常用开发命令：

```bash
node render/render.mjs --preview                       # 960×540、12fps 样片
node render/stills.mjs --shot S05 --lt 1.4,5           # 某个镜头的静帧
node render/stills.mjs --every 2 --w 480 --contact build/contact.png   # 联系表
```

## 目录

```
film/            渲染页与全部画面代码
  src/core/      时间轴、缓动、噪声、相机、画布
  src/ink/       宣纸、笔触、WebGL 水墨后期
  src/world/     远山、云、山坡、老梨树、粒子
  src/actors/    人物骨骼与角色表、风筝、红线、线拐子、燕子
  src/shots/     各镜头（act1/act2/act3/end）
  src/timeline.js 剪辑表
render/          逐帧渲染、静帧与联系表
audio/           作曲、音效、混音
tools/           素材下载、联系表、音频对照图
docs/            剧本、投递材料、素材许可
output/          成片、海报、剧照
```
