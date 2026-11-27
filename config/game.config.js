// config/game.config.js — 全局配置（Cell Dominion）。
export const GAME = {
  id: "cell-dominion",              // pipysdk 的 data-app-id
  name: "Cell Dominion",
  nameZh: "细胞争霸",
  slug: "cell-dominion",
  version: "1.0.0",

  // 画面固定配置：横屏全屏渲染，禁止 9:16 竖屏
  design: { width: 1280, height: 720, aspect: 16 / 9 },

  // UI 主题：玩家洋红 + 敌方青绿 的细胞战场基调（styles.css 的 :root --hue 同值）
  theme: { hue: 322, accent: null },

  // 关卡（闯关游戏 levels.js 必须 ≥ 20 关，红线 14）
  levelsFile: "levels.js",

  // 帧目录约定：assets/images/frames/<角色>/<动作>_01.png …
  frames: {
    dir: "assets/images/frames/",
    manifest: "assets/images/frame-manifest.json",
    canvas: 256,          // 逐帧 PNG 画布边长
    baseline: 16          // 脚底基准线距画布底部像素
  },

  audio: {
    dir: "assets/audio/",
    master: 0.9,
    // v1.1 起 BGM 与全部 SFX 均为 WebAudio 实时合成（见 src/core/audio.js），不再加载任何音频文件。
    // files 仅保留历史 mp3 资产清单作归档参考；loadAudio 现为空操作，缺文件不影响运行。
    files: [
      "sfx_click.mp3", "sfx_attack.mp3", "sfx_hit.mp3", "sfx_capture.mp3",
      "sfx_coin.mp3", "sfx_grow.mp3", "sfx_win.mp3", "sfx_lose.mp3"
    ]
  },

  // 玩法数值基线（对齐 Step 1 源码事实：节点兵力成长 + 派兵飞行 + 翻面占领）
  play: {
    gravity: 0,              // 俯视战场：无重力
    cellRadius: 34,          // 节点基准半径（设计像素）
    cellPowerMax: 100,       // 兵力上限
    cellSizeMin: 0.7,        // 节点尺寸下限
    cellSizeMax: 1.2,        // 节点尺寸上限
    growthSeconds: 1,        // 非中立节点每 N 秒 +1 兵力
    unitRadius: 7,           // 派兵个体半径
    unitSpeed: 300,          // 派兵飞行速度 px/s
    unitSpeedJitter: 46,     // 个体速度抖动，形成散兵线
    unitCap: 420,            // 场上派兵上限（超出不再生成，防卡顿）
    coinsNeutral: 3,         // 占下中立节点奖励金币
    coinsEnemy: 5,           // 占下敌方节点奖励金币
    dragThreshold: 12,       // 拖拽识别最小位移，防误触
    hitSfxGapMs: 70          // 命中音效与光效的最小间隔，防糊成一片
  }
};