// src/game/main.js — 节点派兵玩法主线：拖拽出征 / 同色增益 / 异色翻面 / 敌方 AI / 关卡推进。
// 全部表现走 PNG 资产 + Phaser 内置能力：背景 PNG 铺满、节点用贴图与 Ellipse 描边、
// 动画走 animator 的逐帧序列、光效走逐帧透明 PNG（禁用 Graphics / setTintFill / 物理 debug）。
import { GAME } from "config/game.config.js";
import { LEVELS, SIDE_PLAYER } from "config/levels.js";
import { UI, toast } from "ui/ui.js";
import { Cell, SIDE_COLORS } from "game/cells.js";
import { UnitManager } from "game/units.js";
import { Brain } from "game/ai.js";
import { Animator, createAnims, preloadFrames, playFx } from "core/animator.js";
import { t } from "core/i18n.js";
import { bindKeys, detectTouch } from "game/input.js";
import { applyTheme, lookFor, DEPTH } from "art/theme.js";
import { sfx, loadAudio, musicStart, muteAll, unmuteAll } from "core/audio.js";
import { store } from "core/storage.js";
import { runStart, levelCleared, runFail, bindGamePause, track } from "core/ads.js";

const SAVE_BEST = "cell-dominion-best";
const SAVE_COINS = "cell-dominion-coins";
const SAVE_MUTE = "cell-dominion-muted";    // 用户声音偏好独立存档，广告临时静音不改写它
const ENEMY_SIDES = [2, 3, 4, 5];
const IMG = "assets/images/";          // 背景 / 节点贴图目录（帧序列目录由 frame-manifest 决定）

export class MainScene extends Phaser.Scene {
  constructor() { super("main"); }

  /** frameManifest 由 src/main.js 启动前 fetch 得到，保证 preload 阶段就能数清帧文件 */
  init(data = {}) {
    this.manifest = data.frameManifest;
    this.cells = [];
    this.brains = [];
    this.level = 1;
    this.coins = Number(store.getItem(SAVE_COINS) || 0);
    this.hudTimer = 0;
    this.fxBudget = 0;
    this.muted = store.getItem(SAVE_MUTE) === "1";
    this.mode = "boot";                  // boot / menu / playing / paused / clear / fail
    this.drag = { active: false, from: null, over: null };
  }

  preload() {
    // 开屏加载：真实资源进度 + 动画元素（红线 8 禁止静态进度条）
    this.load.on("progress", (r) => UI.bootProgress(r));
    this.load.on("complete", () => UI.bootProgress(1, "boot.ready"));
    // 画面资产一律逐张 PNG，禁止纯色背景占位
    const bgs = ["bg_arena_dish", "bg_arena_fluid", "bg_arena_colony", "cell_body"];
    bgs.forEach((k) => this.load.image(k, `${IMG}${k}.png`));
    for (let i = 1; i <= 12; i++) {
      const k = `face_${String(i).padStart(2, "0")}`;
      this.load.image(k, `${IMG}${k}.png`);
    }
    preloadFrames(this, this.manifest);
  }

  create() {
    applyTheme();
    createAnims(this, this.manifest);
    this.animator = new Animator(this, this.manifest);
    this.units = new UnitManager(this, this.animator, this.manifest);

    this.bg = this.add.image(GAME.design.width / 2, GAME.design.height / 2, "bg_arena_colony")
      .setDepth(DEPTH.bg).setDisplaySize(GAME.design.width, GAME.design.height);
    // 远景层次：同一张背景放大压暗，不额外产图
    this.bgFar = this.add.image(GAME.design.width / 2, GAME.design.height / 2, "bg_arena_colony")
      .setDepth(DEPTH.far).setDisplaySize(GAME.design.width * 1.12, GAME.design.height * 1.12)
      .setAlpha(.34).setTint(lookFor("bg_arena_colony").far);

    // 拖拽瞄准层：矩形 + 圆环 + 目标圈（禁用 Graphics / lineStyle）
    this.aimLine = this.add.rectangle(0, 0, 2, 7, 0xffffff, .5).setOrigin(0, .5).setDepth(DEPTH.fx).setVisible(false);
    this.aimTip = this.add.ellipse(0, 0, 22, 22, 0xffffff, .4).setDepth(DEPTH.fx).setVisible(false);
    this.targetRing = this.add.ellipse(0, 0, 96, 96, 0x000000, 0).setStrokeStyle(4, SIDE_COLORS[SIDE_PLAYER], .95)
      .setDepth(DEPTH.fx).setVisible(false);

    this.touch = detectTouch();
    this.keys = bindKeys(this, { pause: ["ESC"] });
    this.bindPointer();
    this.bindUi();
    UI.setSound(this.muted);                     // 声音图标先与存档偏好对齐，再决定是否静音
    if (this.muted) muteAll();

    loadAudio().then(() => { if (!this.muted) musicStart("bgm", { volume: .45 }); });
    bindGamePause(
      () => this.pauseRun(),
      () => { if (this.mode === "paused") { this.mode = "playing"; this.scene.resume(); } },
      () => muteAll(),                           // 广告期间临时静音，不回写用户偏好
      () => { if (!this.muted) unmuteAll(); }
    );

    // 加载完成：开屏淡出 → 主菜单，点 Play 才真正开局
    UI.bootDone();
    this.mode = "menu";
    this.scene.pause();
    UI.menu({ best: Number(store.getItem(SAVE_BEST) || 0), coins: this.coins, level: this.level });
    UI.guide();                                  // 首次进入自动展示一次，之后可从菜单图标再打开
  }

  /* ---------------- 输入：拖拽派兵 ---------------- */
  bindPointer() {
    this.input.on("pointerdown", (p) => {
      if (this.mode !== "playing") return;
      const c = this.cellAt(p.x, p.y);
      if (!c || c.side !== SIDE_PLAYER) return;
      this.drag.active = true;
      this.drag.from = c;
      this.drag.over = null;
      this.aimLine.setVisible(true).setPosition(c.x, c.y).setDisplaySize(2, 7);
      this.aimTip.setVisible(true).setPosition(c.x, c.y);
    });
    this.input.on("pointermove", (p) => {
      if (!this.drag.active) return;
      const from = this.drag.from;
      const len = Math.max(2, Phaser.Math.Distance.Between(from.x, from.y, p.x, p.y));
      this.aimLine.setPosition(from.x, from.y);
      this.aimLine.setDisplaySize(len, 7);
      this.aimLine.setRotation(Math.atan2(p.y - from.y, p.x - from.x));
      this.aimTip.setPosition(p.x, p.y);
      const over = this.cellAt(p.x, p.y);
      this.drag.over = over && over !== from ? over : null;
      if (this.drag.over) {
        const t2 = this.drag.over;
        this.targetRing.setVisible(true).setPosition(t2.x, t2.y)
          .setDisplaySize(t2.radius * 2.5, t2.radius * 2.5);
      } else {
        this.targetRing.setVisible(false);
      }
    });
    const finish = (p) => this.endDrag(p);
    this.input.on("pointerup", finish);
    this.input.on("pointerupoutside", finish);
    this.input.on("gameout", () => this.endDrag(this.input.activePointer));
  }

  /** 命中判定：取最近且在节点半径 +6 容差内的节点 */
  cellAt(x, y) {
    let best = null;
    let bd = Infinity;
    for (const c of this.cells) {
      if (c.dead) continue;
      const d = Phaser.Math.Distance.Between(x, y, c.x, c.y);
      if (d <= c.radius + 6 && d < bd) { bd = d; best = c; }
    }
    return best;
  }

  endDrag(p) {
    const from = this.drag.from;
    const over = this.drag.over;
    const wasActive = this.drag.active;
    this.drag.active = false;
    this.drag.from = null;
    this.drag.over = null;
    this.hideAim();
    if (!wasActive || !from || !over || !p) return;
    const dist = Phaser.Math.Distance.Between(from.x, from.y, p.x, p.y);
    if (dist < GAME.play.dragThreshold) return;                 // 位移过小视为误触
    const sent = from.attack(over);
    if (sent > 0) {
      sfx("sfx_click", { volume: .5 });
      track("send_troops", { level: this.level, n: sent });
      if (UI.guideKey) UI.closeGuide();                          // 完成一次派兵即关闭引导
    }
  }

  hideAim() {
    this.aimLine.setVisible(false);
    this.aimTip.setVisible(false);
    this.targetRing.setVisible(false);
  }

  /* ---------------- UI 事件 ---------------- */
  bindUi() {
    UI.init({
      start: () => this.startRun(),
      pause: () => this.pauseRun(),
      resume: () => { this.mode = "playing"; this.scene.resume(); },
      restart: () => { this.startLevel(this.level); this.mode = "playing"; this.scene.resume(); },
      next: () => { this.startLevel(this.level + 1); this.mode = "playing"; this.scene.resume(); },
      home: () => { this.mode = "menu"; UI.menu({ best: this.bestStage(), coins: this.coins, level: this.level }); this.scene.pause(); },
      revive: () => { this.revivePlayer(); this.mode = "playing"; this.scene.resume(); toast(t("ad.rewarded")); },
      reward: ({ kind }) => {
        if (kind === "doubleCoins") { this.coins += this.levelCoins; this.save(); toast(t("ad.rewarded")); }
        if (kind === "extraLife") { this.revivePlayer(); toast(t("ad.rewarded")); }
        this.updateHud();
      },
      sound: () => this.toggleSound()
    });
  }

  /** 声音开关：BGM 与音效一起切换，偏好写进独立存档键 */
  toggleSound() {
    this.muted = !this.muted;
    if (this.muted) muteAll(); else unmuteAll();
    store.setItem(SAVE_MUTE, this.muted ? "1" : "0");
    UI.setSound(this.muted);
  }

  /* ---------------- 关卡 ---------------- */
  startRun() {
    this.startLevel(this.level);
    this.mode = "playing";
    runStart({ level: this.level });
    UI.wipe();
    UI.hud(this.snapshot());
    UI.touchControls();
    this.scene.resume();
  }

  startLevel(i) {
    this.level = Math.max(1, Math.min(LEVELS.length, i));
    const def = LEVELS[this.level - 1];
    const look = lookFor(def.bg);
    this.bg.setTexture(def.bg).setTint(look.tint).setAlpha(look.alpha);
    this.bgFar.setTexture(def.bg).setTint(look.far).setAlpha(.34);

    this.hideAim();
    this.drag.active = false;
    this.units.clear();
    this.cells.forEach((c) => c.destroy());
    this.cells = [];
    this.brains = [];
    this.levelCoins = 0;

    def.cells.forEach((cfg, k) => {
      const cell = new Cell(this, cfg, k);
      this.cells.push(cell);
      if (cfg.ai) this.brains.push(new Brain(this, cell, cfg.ai));
    });
    this.updateHud();
  }

  /** 复活：把一个非己方节点交还给我们并补一支守军，保证有翻身筹码 */
  revivePlayer() {
    const pool = this.cells.filter((c) => c.side !== SIDE_PLAYER && !c.dead)
      .sort((a, b) => a.power - b.power);
    const target = pool[0] || this.cells[0];
    if (target) {
      target.side = SIDE_PLAYER;
      target.power = 30;
      target.refresh();
      this.playFxAt("plusone", target.x, target.y, .9, SIDE_COLORS[SIDE_PLAYER], true);
    }
    this.updateHud();
  }

  pauseRun() {
    if (this.mode !== "playing") return;
    this.mode = "paused";
    this.hideAim();
    UI.pause();
    this.scene.pause();
  }

  /* ---------------- 结算 ---------------- */
  onPlayerCapture(cell, wasNeutral) {
    const gain = wasNeutral ? GAME.play.coinsNeutral : GAME.play.coinsEnemy;
    this.coins += gain;
    this.levelCoins += gain;
    this.playFxAt("coin", cell.x, cell.y, .7, 0xffd76a);
    sfx("sfx_coin", { volume: .6 });
    this.save();
    this.updateHud();
    track("capture", { level: this.level, neutral: wasNeutral });
  }

  onClear() {
    if (this.mode !== "playing") return;
    this.mode = "clear";
    const best = Math.max(this.bestStage(), this.level);
    store.setItem(SAVE_BEST, String(best));
    levelCleared({ level: this.level });
    sfx("sfx_win", { volume: .85 });
    this.scene.pause();
    UI.clear({
      level: this.level,
      score: this.totalFor(SIDE_PLAYER),
      coins: this.coins,
      last: this.level >= LEVELS.length
    });
  }

  onFail() {
    if (this.mode !== "playing") return;
    this.mode = "fail";
    runFail({ level: this.level });
    sfx("sfx_lose", { volume: .7 });
    this.time.delayedCall(600, () => {
      if (this.mode !== "fail") return;
      this.scene.pause();
      UI.fail({ level: this.level, score: this.totalFor(SIDE_PLAYER) });
    });
  }

  /** 势力总兵力 = 己方节点兵力之和 + 在途部队数（在途也算筹码，避免误判） */
  totalFor(side) {
    let sum = 0;
    for (const c of this.cells) if (c.side === side && !c.dead) sum += c.power;
    return sum + this.units.countBySide(side);
  }

  enemyTotal() {
    let sum = 0;
    for (const c of this.cells) if (c.side >= 2 && !c.dead) sum += c.power;
    for (const s of ENEMY_SIDES) sum += this.units.countBySide(s);
    return sum;
  }

  bestStage() { return Number(store.getItem(SAVE_BEST) || 0); }

  snapshot() {
    return { level: this.level, score: this.totalFor(SIDE_PLAYER), coins: this.coins, enemy: this.enemyTotal() };
  }

  updateHud() {
    if (this.mode === "menu" || this.mode === "boot") return;
    UI.hud(this.snapshot());
  }

  save() {
    try {
      store.setItem(SAVE_COINS, String(this.coins));
      store.setItem(SAVE_BEST, String(Math.max(this.bestStage(), this.level - 1)));
    } catch { /* 隐私模式忽略 */ }
  }

  /** 光效入口：带每帧预算，防止几十个节点同时结算时刷屏；force 用于必须可见的关键反馈 */
  playFxAt(name, x, y, scale = 1, tint, force = false) {
    if (!force && this.fxBudget <= 0) return null;
    if (!force) this.fxBudget -= 1;
    return playFx(this, name, x, y, { scale: scale, tint: tint, depth: DEPTH.fx });
  }

  /* ---------------- 主循环 ---------------- */
  update(time, delta) {
    const dt = delta / 1000;
    if (this.mode !== "playing") { this.keys.endFrame(); return; }
    this.fxBudget = 5;

    // 节点成长：非中立每秒 +1，光效最多同时播 3 处
    let growFx = 0;
    for (const c of this.cells) {
      if (c.growUpdate(dt) && growFx < 3) {
        growFx++;
        this.playFxAt("plusone", c.x, c.y - c.radius * .8, .5, SIDE_COLORS[c.side]);
        sfx("sfx_grow", { volume: .3 });
      }
    }

    this.units.update(dt);
    for (const b of this.brains) b.update(dt);

    if (this.keys.justPressed("pause")) this.pauseRun();
    this.keys.endFrame();

    this.hudTimer += dt;
    if (this.hudTimer >= .25) { this.hudTimer = 0; this.updateHud(); }

    this.checkEnd();
  }

  checkEnd() {
    if (this.mode !== "playing") return;
    if (this.totalFor(SIDE_PLAYER) <= 0) { this.onFail(); return; }
    const neutrals = this.cells.some((c) => c.side === 0 && !c.dead);
    const foes = ENEMY_SIDES.some((s) => this.totalFor(s) > 0);
    if (!neutrals && !foes) this.onClear();
  }
}