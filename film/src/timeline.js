// 《纸鸢》剪辑表：镜头顺序、时长、转场、配乐段落
import { buildTimeline } from './core/timeline.js';
import TEST from './shots/test.js';
import STYLE from './shots/style.js';
import CAST from './shots/castsheet.js';
import PROPS from './shots/propsheet.js';
import HANDS from './shots/handsheet.js';
import { S01, S02, S03, S04, S05, S06, S07, S08, S09 } from './shots/act1.js';
import { S10, S11, S12, S13, S13C, S14A, S14B, S14C, S15, S16 } from './shots/act2.js';
import { S05B, S13B, S15B, S16B, S22B, part } from './shots/closeups.js';
import { S17, S18, S19, S20A, S20B, S20C, S21A, S21B, S21C, S22, S23, S24, S25 } from './shots/act3.js';
import { S26, S27, POSTER } from './shots/end.js';

// 环境声标签（供混音脚本使用）
const AMB = { S01: 'opening', S02: 'spring', S03: 'insert', S04: 'insert', S05: 'spring', S06: 'spring', S07: 'sky', S08: 'sky', S09: 'spring' };
for (const [s, a] of [[S01, 'opening'], [S02, 'spring'], [S03, 'insert'], [S04, 'insert'], [S05, 'spring'], [S06, 'spring'], [S07, 'sky'], [S08, 'sky'], [S09, 'spring'], [S11, 'insert'], [S21B, 'insert'], [S21C, 'insert']]) s.amb = a;
void AMB;

// v2：在动情处切开原镜头，插入特写
const S05A = part(S05, 'S05', 0, 4.7);
const S05C = part(S05, 'S05C', 5.3, 8.0);
const S13A = part(S13, 'S13', 0, 10.6);
const S15A = part(S15, 'S15', 0, 8.45);
const S15C = part(S15, 'S15C', 8.6, 14);
const S16A = part(S16, 'S16', 0, 8.3);
const S16C = part(S16, 'S16C', 9.2, 16);

const EDIT = [
  // 第一幕 · 春
  { shot: S01, music: 'M1' },
  { shot: S02, trans: { type: 'paper', dur: 1.6 } },
  { shot: S03, trans: { type: 'cross', dur: 0.8 } },
  { shot: S04, trans: { type: 'cross', dur: 0.6 } },
  { shot: S05A, trans: { type: 'cross', dur: 0.5 } },
  { shot: S05B, trans: { type: 'cross', dur: 0.4 } },
  { shot: S05C, trans: { type: 'cross', dur: 0.4 } },
  { shot: S06, music: 'M2' },
  { shot: S07 },
  { shot: S08, trans: { type: 'cross', dur: 0.8 } },
  { shot: S09, trans: { type: 'cross', dur: 1.2 } },
  // 第二幕 · 夏秋冬
  { shot: S10, trans: { type: 'ink', dur: 2.0 }, music: 'M3' },
  { shot: S11, trans: { type: 'cross', dur: 0.6 } },
  { shot: S12, trans: { type: 'ink', dur: 1.6 } },
  { shot: S13A, trans: { type: 'ink', dur: 1.6 } },
  { shot: S13B },
  { shot: S13C },
  { shot: S14A, trans: { type: 'paper', dur: 1.4 } },
  { shot: S14B, trans: { type: 'cross', dur: 1.2 } },
  { shot: S14C, trans: { type: 'cross', dur: 1.2 } },
  { shot: S15A, trans: { type: 'ink', dur: 2.0 }, music: 'M4' },
  { shot: S15B },
  { shot: S15C },
  { shot: S16A, trans: { type: 'paper', dur: 2.0 } },
  { shot: S16B, trans: { type: 'cross', dur: 0.5 } },
  { shot: S16C, trans: { type: 'cross', dur: 0.5 } },
  // 第三幕 · 春又来
  { shot: S17, trans: { type: 'cross', dur: 1.0 }, music: 'M5' },
  { shot: S18, trans: { type: 'cross', dur: 1.2 } },
  { shot: S19 },
  { shot: S20A },
  { shot: S20B, trans: { type: 'paper', dur: 0.8 } },
  { shot: S20C, trans: { type: 'paper', dur: 0.8 } },
  { shot: S21A, trans: { type: 'cross', dur: 0.6 } },
  { shot: S21B, trans: { type: 'cross', dur: 0.5 } },
  { shot: S21C, trans: { type: 'cross', dur: 0.5 } },
  { shot: S22, trans: { type: 'cross', dur: 0.8 }, music: 'M6' },
  { shot: S22B, trans: { type: 'cross', dur: 0.4 } },
  { shot: S23, trans: { type: 'cross', dur: 0.4 } },
  { shot: S24, trans: { type: 'cross', dur: 0.8 } },
  { shot: S25, trans: { type: 'cross', dur: 0.8 } },
  // 题献、片尾
  { shot: S26, music: 'M7' },
  { shot: S27, trans: { type: 'cross', dur: 1.0 } },
];

export const TIMELINE = buildTimeline(EDIT);
export const DEV = { TEST, STYLE, CAST, PROPS, HANDS, POSTER };
