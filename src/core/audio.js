// src/core/audio.js — 音频：全部 WebAudio 实时合成（黑暗战术紧张风格），不再依赖任何音频文件资产。
// BGM：调度器模式（lookahead scheduler），音符级无缝循环；
// SFX：8 个音效全部由振荡器 + 噪声即时合成，无网络加载、零资产体积。
// 所有声音统一经 master 增益，受静音 / 广告临时静音控制。
import { GAME } from "config/game.config.js";
import { store } from "core/storage.js";

const ctx = new (window.AudioContext || window.webkitAudioContext)();
let gainNode = null;
let bgm = null;                   // 程序化 BGM：{ gain, volume, step, nextTime, timer }
let muted = store.getItem("cell-dominion-muted") === "1";
let pendingMusic = null;          // 首次手势前请求的 BGM：解锁后补播，避免被自动播放策略吞掉

function master() {
  if (!gainNode) { gainNode = ctx.createGain(); gainNode.gain.value = GAME.audio.master; gainNode.connect(ctx.destination); }
  return gainNode;
}

/**
 * 兼容旧接口：音效已改为纯合成，无需预加载；保留异步签名让调用方（main.js）无需改动。
 */
export async function loadAudio() { return []; }

/** 浏览器要求首次手势后才允许出声：任意一次交互解锁，并把待播的 BGM 补上 */
function armUnlock() {
  const events = ["pointerdown", "keydown", "touchstart"];
  const go = () => {
    events.forEach((ev) => document.removeEventListener(ev, go));
    ctx.resume().then(flushPending).catch(() => { /* 无手势时忽略 */ });
  };
  events.forEach((ev) => document.addEventListener(ev, go, { passive: true }));
}

function flushPending() {
  if (!pendingMusic) return;
  const p = pendingMusic;
  pendingMusic = null;
  musicStart(p.name, p.opts);
}

if (ctx.state !== "running") armUnlock();

/* ============================ 音效（SFX，纯 WebAudio 合成） ============================ */
// 黑暗战术风音效语言：低频厚重、金属冷硬、克制不花哨。
// rate 参数沿用旧 buffer 语义：>1 更快更尖，<1 更慢更低。

function sfxNoise(dur) {
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** 振荡器 + AD/ADR 包络（freq 可传 {from,to} 做滑音），freqs 已含 rate 缩放 */
function sfxTone({ freq, t0 = 0, dur, type = "sine", peak, attack = 0.004, curve = "exp", dest } = {}) {
  const start = ctx.currentTime + t0;
  const o = ctx.createOscillator();
  o.type = type;
  if (typeof freq === "object") {
    o.frequency.setValueAtTime(Math.max(20, freq.from), start);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq.to), start + dur);
  } else o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  if (curve === "exp") {
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  } else {
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.setValueAtTime(peak, start + Math.max(attack, dur * 0.7));
    g.gain.linearRampToValueAtTime(0.0001, start + dur);
  }
  o.connect(g).connect(dest || master());
  o.start(start); o.stop(start + dur + 0.03);
}

/** 噪声爆发（可带滤波与频率滑动），freq 已含 rate 缩放 */
function sfxBurst({ dur, peak, t0 = 0, filter = "lowpass", fFrom = 3000, fTo = 300, Q = 0.8, dest } = {}) {
  const start = ctx.currentTime + t0;
  const s = ctx.createBufferSource(); s.buffer = sfxNoise(dur);
  const f = ctx.createBiquadFilter(); f.type = filter; f.Q.value = Q;
  f.frequency.setValueAtTime(Math.max(40, fFrom), start);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, fTo), start + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  s.connect(f).connect(g).connect(dest || master());
  s.start(start); s.stop(start + dur + 0.03);
}

const SFX = {
  // 点击：冷硬的低哑 blip，短促克制
  sfx_click(r, v) {
    sfxTone({ freq: { from: 300 * r, to: 170 * r }, dur: 0.07 / r, type: "square", peak: 0.28 * v });
    sfxTone({ freq: 90 * r, dur: 0.05 / r, type: "sine", peak: 0.18 * v });
  },
  // 派兵：低沉出膛 whoosh——噪声下扫 + 轻推力
  sfx_attack(r, v) {
    sfxBurst({ dur: 0.22 / r, peak: 0.22 * v, fFrom: 2400 * r, fTo: 220 * r });
    sfxTone({ freq: { from: 120 * r, to: 70 * r }, dur: 0.18 / r, type: "triangle", peak: 0.3 * v });
  },
  // 命中：厚重肉感撞击——sub 下坠 + 低通噪声拍
  sfx_hit(r, v) {
    sfxTone({ freq: { from: 170 * r, to: 52 * r }, dur: 0.16 / r, type: "sine", peak: 0.55 * v });
    sfxBurst({ dur: 0.09 / r, peak: 0.24 * v, fFrom: 1400 * r, fTo: 160 * r });
  },
  // 占领：冷峻双音上行（小三度），低音衬底宣示归属
  sfx_capture(r, v) {
    const b = 196 * r;                       // G3
    sfxTone({ freq: b, dur: 0.1 / r, type: "triangle", peak: 0.3 * v });
    sfxTone({ freq: b * 1.189, t0: 0.09 / r, dur: 0.22 / r, type: "triangle", peak: 0.32 * v }); // Bb3：小三度
    sfxTone({ freq: 49 * r, dur: 0.34 / r, type: "sine", peak: 0.35 * v, attack: 0.02 });
  },
  // 金币：金属数据拾取——两只高方波短音，压暗不刺耳
  sfx_coin(r, v) {
    sfxTone({ freq: 880 * r, dur: 0.06 / r, type: "square", peak: 0.14 * v });
    sfxTone({ freq: 1174 * r, t0: 0.06 / r, dur: 0.1 / r, type: "square", peak: 0.12 * v });
    sfxTone({ freq: 220 * r, dur: 0.14 / r, type: "sine", peak: 0.12 * v });
  },
  // 兵力成长：sub 膨胀上浮，呼吸感
  sfx_grow(r, v) {
    sfxTone({ freq: { from: 58 * r, to: 92 * r }, dur: 0.3 / r, type: "sine", peak: 0.3 * v, attack: 0.08, curve: "lin" });
  },
  // 胜利：小调压抑中撕开的低沉上行三连音
  sfx_win(r, v) {
    const seq = [110, 130.81, 164.81, 220];  // A2 C3 E3 A3（A 小调上行，收在主音）
    seq.forEach((f, i) => sfxTone({ freq: f, t0: i * 0.13, dur: 0.24, type: "triangle", peak: 0.34 * v, attack: 0.01 }));
    sfxTone({ freq: 55, dur: 1.1, type: "sine", peak: 0.3 * v, attack: 0.05, curve: "lin" });
    sfxBurst({ dur: 0.5, peak: 0.1 * v, fFrom: 900, fTo: 120 });
  },
  // 失败：下沉双音 + sub 塌陷，余韵长
  sfx_lose(r, v) {
    sfxTone({ freq: { from: 220, to: 196 }, t0: 0, dur: 0.4, type: "triangle", peak: 0.3 * v, attack: 0.02, curve: "lin" });
    sfxTone({ freq: { from: 174.61, to: 110 }, t0: 0.32, dur: 0.7, type: "triangle", peak: 0.28 * v, attack: 0.02, curve: "lin" });
    sfxTone({ freq: { from: 82, to: 36 }, t0: 0.32, dur: 1.0, type: "sine", peak: 0.34 * v, attack: 0.04, curve: "lin" });
  },
};

export function sfx(name, { volume = 1, rate = 1 } = {}) {
  if (muted) return;
  const fn = SFX[String(name).replace(/\.[^.]+$/, "")];
  if (!fn) return;
  if (ctx.state === "suspended") ctx.resume();
  const r = Math.max(0.25, Math.min(4, rate || 1));
  fn(r, volume);
}

/* ============================ 程序化背景音乐（WebAudio 合成·黑暗战术紧张） ============================ */
// 调度器模式（lookahead scheduler）：按节拍提前 0.12s 排程音符，循环天然无缝。
// 82 BPM，四小节 Dm – Bb – Gm – A（i–VI–iv–V 的紧张和声圈）：
// 心跳式 sub 双跳（lub-dub）+ 低音根脉冲 + 黑暗微失谐 pad + 十六分警报 tick + 不协和二度警戒音。
const BGM_TEMPO = 82;
const BGM_STEP = 16;
const CHORDS = [
  { bass: 73.42,  pad: [146.83, 174.61, 220.00], alarm: 587.33 }, // Dm  (D2)
  { bass: 58.27,  pad: [116.54, 174.61, 233.08], alarm: 554.37 }, // Bb  (Bb1)
  { bass: 49.00,  pad: [146.83, 196.00, 233.08], alarm: 493.88 }, // Gm  (G1)
  { bass: 55.00,  pad: [138.59, 164.81, 220.00], alarm: 622.25 }, // A   (A1, 含 C# 张力)
];
let noiseBuf = null;

function bgmBus() { return bgm ? bgm.gain : master(); }

function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** 心跳双跳：sub sine 快速下坠，lub 强 dub 弱 */
function bgmHeartbeat(t0, strong) {
  const beat = (t, peak) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(bgmBus());
    o.start(t); o.stop(t + 0.18);
  };
  beat(t0, strong ? 0.62 : 0.4);
  beat(t0 + (60 / BGM_TEMPO) / 2, strong ? 0.34 : 0.22);
}

/** 低音根脉冲：三角波短促推进 */
function bgmBass(freq, t0, dur, peak = 0.5) {
  const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(bgmBus());
  o.start(t0); o.stop(t0 + dur + 0.02);
}

/** 黑暗 pad：三路微失谐锯齿过低通 + 缓慢开合，整小节渐入渐出 */
function bgmPad(chord, t0, dur, peak) {
  const filt = ctx.createBiquadFilter();
  filt.type = "lowpass"; filt.Q.value = 1.1;
  filt.frequency.setValueAtTime(520, t0);
  filt.frequency.linearRampToValueAtTime(1050, t0 + dur * 0.55);
  filt.frequency.linearRampToValueAtTime(560, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.6);
  g.gain.setValueAtTime(peak, t0 + Math.max(0.6, dur - 0.7));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  filt.connect(g).connect(bgmBus());
  chord.pad.forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth"; o.frequency.value = f; o.detune.value = (i - 1) * 9;
    o.connect(filt); o.start(t0); o.stop(t0 + dur + 0.05);
  });
}

/** 警戒 tick：高通噪声短滴，制造倒计时压迫感 */
function bgmTickNoise(t0, peak = 0.05) {
  const s = ctx.createBufferSource(); s.buffer = noise();
  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);
  s.connect(hp).connect(g).connect(bgmBus());
  s.start(t0); s.stop(t0 + 0.05);
}

/** 警戒音：高频微颤 sine 长音悬在头顶，每小节重新起音 */
function bgmAlarm(freq, t0, dur, peak = 0.045) {
  const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = freq;
  const lfo = ctx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 5.5;
  const lfoG = ctx.createGain(); lfoG.gain.value = freq * 0.008;
  lfo.connect(lfoG).connect(o.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.25);
  g.gain.setValueAtTime(peak, t0 + Math.max(0.25, dur - 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(bgmBus());
  o.start(t0); o.stop(t0 + dur + 0.05);
  lfo.start(t0); lfo.stop(t0 + dur + 0.05);
}

/** 张力 stab：小二度双音短促撞击，隔小节落一次 */
function bgmStab(freq, t0) {
  [freq, freq * 1.0595].forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
    const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(i ? 0.05 : 0.07, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
    o.connect(filt).connect(g).connect(bgmBus());
    o.start(t0); o.stop(t0 + 0.16);
  });
}

function bgmScheduleStep(step, time) {
  const bar = Math.floor(step / BGM_STEP);
  const chord = CHORDS[bar % CHORDS.length];
  const local = step % BGM_STEP;
  if (local === 0) {                                  // 小节头：pad + 低音根 + 强心跳
    bgmPad(chord, time, (60 / BGM_TEMPO) * 4, 0.075);
    bgmBass(chord.bass, time, 0.55, 0.5);
    bgmHeartbeat(time, true);
    bgmAlarm(chord.alarm, time, (60 / BGM_TEMPO) * 4, 0.05);
  }
  if (local === 8) {                                  // 第 3 拍：弱心跳 + 低音补根
    bgmHeartbeat(time, false);
    bgmBass(chord.bass, time, 0.4, 0.38);
  }
  if (local === 4 && bar % 2 === 1) bgmStab(chord.alarm / 2, time);   // 隔小节不协和 stab
  bgmTickNoise(time, local % 4 === 0 ? 0.028 : (local % 2 === 0 ? 0.016 : 0.0));  // 十六分 tick，反拍更弱
}

function bgmTick() {
  if (!bgm) return;
  const sec16 = 60 / BGM_TEMPO / 4;
  while (bgm.nextTime < ctx.currentTime + 0.12) {
    bgmScheduleStep(bgm.step, bgm.nextTime);
    bgm.nextTime += sec16;
    bgm.step++;
  }
}

function startBgm(volume = 0.45) {
  if (bgm) musicStop();
  if (ctx.state !== "running") { pendingMusic = { name: "bgm", opts: { volume } }; ctx.resume().catch(() => { /* 等手势 */ }); return; }
  const g = ctx.createGain();
  g.gain.value = muted ? 0 : volume;
  g.connect(master());
  bgm = { gain: g, volume, step: 0, nextTime: ctx.currentTime + 0.08, timer: null };
  bgm.timer = setInterval(bgmTick, 25);
  bgmTick();
}

/* ============================ 音乐总入口 ============================ */
export function musicStart(name = "bgm", opts = {}) {
  const { volume = 0.45 } = opts;
  if (name === "bgm") return startBgm(volume);   // 程序化合成，无需缓冲
}

export function musicStop() {
  pendingMusic = null;
  if (bgm) {                                     // 快速淡出在途音符后停调度（共享 gain 一并静音）
    try {
      bgm.gain.gain.cancelScheduledValues(ctx.currentTime);
      bgm.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02);
    } catch { /* 已断开 */ }
    const t = bgm.timer;
    bgm = null;
    clearInterval(t);
  }
}

/** 广告播放期间静音，结束后恢复（SDK 文档 onAdStart/onAdEnd 的落点） */
export function muteAll() {
  muted = true;
  if (bgm) bgm.gain.gain.value = 0;
}
export function unmuteAll() {
  muted = false;
  if (bgm) bgm.gain.gain.value = bgm.volume;
}
export function isMuted() { return muted; }
export function resumeContext() { if (ctx.state === "suspended") ctx.resume(); flushPending(); }

/** 调试探针：返回 BGM 调度器状态，供自动化验收（确认合成循环真的在跑） */
export function _debugBgm() {
  return { active: !!bgm, step: bgm ? bgm.step : 0, ctxState: ctx.state, muted };
}
