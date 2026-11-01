# 素材来源与许可

全片画面、人物、动画与配乐均由本仓库代码生成。下列第三方素材由 `tools/fetch_assets.py` 下载，文件校验值记录在 `assets/manifest.json`。

## 第三方素材

| 文件 | 用途 | 作者 | 许可 | 来源 |
|---|---|---|---|---|
| `fonts/MaShanZheng-Regular.ttf` | 片名、印章 | Ma Shan Zheng | OFL-1.1 | [链接](https://fonts.google.com/specimen/Ma+Shan+Zheng) |
| `fonts/ZhiMangXing-Regular.ttf` | 题诗、题献（行书） | Wei Zhimang | OFL-1.1 | [链接](https://fonts.google.com/specimen/Zhi+Mang+Xing) |
| `fonts/ZCOOLXiaoWei-Regular.ttf` | 片尾字幕（中文） | ZCOOL | OFL-1.1 | [链接](https://fonts.google.com/specimen/ZCOOL+XiaoWei) |
| `fonts/CormorantGaramond.ttf` | 英文字幕 | Christian Thalmann | OFL-1.1 | [链接](https://fonts.google.com/specimen/Cormorant+Garamond) |
| `fonts/CormorantGaramond-Italic.ttf` | 英文字幕（斜体） | Christian Thalmann | OFL-1.1 | [链接](https://fonts.google.com/specimen/Cormorant+Garamond) |
| `soundfont/GeneralUser-GS.sf2` | 配乐音色 | S. Christian Collins | GeneralUser GS License v2.0（可自由用于音乐创作，含商用） | [链接](https://www.schristiancollins.com/generaluser) |
| `sfx/wind_background_noise_2.wav` | 四季风声底 | bashar3a | CC0 | [链接](https://opengameart.org/content/mild-wind-background-noise) |
| `sfx/short_wind_sound.wav` | 阵风 | remaxim | CC0 | [链接](https://opengameart.org/content/short-wind-sound) |
| `sfx/park_ambience_birds.wav` | 春天鸟鸣环境声 | thimras | CC0 | [链接](https://opengameart.org/content/park-ambiences) |
| `sfx/park_ambience_wind.wav` | 树叶风声环境声 | thimras | CC0 | [链接](https://opengameart.org/content/park-ambiences) |
| `sfx/birds-isaiah658.ogg` | 鸟鸣 | isaiah658 | CC0 | [链接](https://opengameart.org/content/ambient-bird-sounds) |
| `sfx/birdchirping071414.wav` | 鸟鸣点缀 | syncopika | CC0 | [链接](https://opengameart.org/content/bird-chirping-sounds) |
| `sfx/cicadas_1.ogg` | 夏天蝉鸣 | syncopika | CC0 | [链接](https://opengameart.org/content/cicada-sounds) |
| `sfx/cicadas_2.ogg` | 夏天蝉鸣 | syncopika | CC0 | [链接](https://opengameart.org/content/cicada-sounds) |
| `sfx/SnowWalk.zip` | 雪地脚步 | ignasd | CC0 | [链接](https://opengameart.org/content/walking-on-snow-sound) |
| `sfx/engine_sound.mp3` | 汽车引擎 | pauliuw | CC0 | [链接](https://opengameart.org/content/engine-sounds2) |

许可说明：
- **SIL Open Font License 1.1**：字体可以自由使用、嵌入和再分发；许可文本随字体一同下载（`assets/fonts/*-OFL.txt`）。
- **GeneralUser GS License v2.0**：作者声明可以不受限制地用于个人或商业音乐创作（`assets/soundfont/GeneralUser-GS-LICENSE.txt`）。
- **CC0**：放弃版权，可自由使用，无需署名；片尾仍列出作者以示感谢。

## 公有领域文本

- 题诗：清 · 高鼎《村居》“儿童散学归来早，忙趁东风放纸鸢”。

## 工具

- Chromium + Playwright（逐帧绘制与 WebGL 后期）
- FFmpeg（编码、响度标准化）
- Python：NumPy、SciPy、soundfile、tinysoundfont（作曲渲染与音效合成）
- Claude（Anthropic）：协助完成代码、作曲与制作
