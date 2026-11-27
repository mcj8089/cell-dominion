// src/core/animator.js — 动画管理与状态切换的唯一封装（红线 4/5 的落点）
// 规则：所有角色表现必须由 Phaser 内置 Anims + 逐帧 PNG 序列驱动。
//      循环动作 ≥ 4 帧、一次性动作 ≥ 3 帧，低于下限直接抛错，防止退化成两张图切换。

export const MIN_FRAMES = { loop: 4, once: 3 };

export const frameFile = (char, action, i) => `${char}_${action}_${String(i + 1).padStart(2, "0")}.png`;
export const frameKey = (char, action, i) => `f_${char}_${action}_${String(i + 1).padStart(2, "0")}`;
export const animKey = (char, action) => `${char}_${action}`;

/** 该角色的帧实际来源角色：reuseOf 表示复用底图（换色换装），不再单独产图 */
const sourceOf = (manifest, char) => manifest.characters?.[char]?.reuseOf || char;

/** Step 4 前由 frame-manifest.json 驱动的资源加载；只加载清单声明的帧，不多不少 */
export function preloadFrames(scene, manifest) {
  const dir = manifest.dir || "assets/images/frames/";
  for (const [char, def] of Object.entries(manifest.characters)) {
    if (def.reuseOf) continue;                       // 复用底图的角色不加载新文件
    for (const [action, a] of Object.entries(def.actions)) {
      const n = a.frames || 0;
      if (n < MIN_FRAMES[a.type === "once" ? "once" : "loop"]) {
        throw new Error(`[animator] ${char}.${action} 只有 ${n} 帧，低于 ${a.type} 下限`);
      }
      for (let i = 0; i < n; i++) scene.load.image(frameKey(char, action, i), `${dir}${frameFile(char, action, i)}`);
    }
  }
  for (const [fx, a] of Object.entries(manifest.fx || {})) {
    for (let i = 0; i < a.frames; i++) scene.load.image(frameKey("fx", fx, i), `${dir}fx/${fx}_${String(i + 1).padStart(2, "0")}.png`);
  }
}

/** 把清单里的动作全部注册成 Phaser 动画；一次性动作播完由 Animator 负责回落 */
export function createAnims(scene, manifest) {
  const made = [];
  const build = (key, prefix, count, cfg) => {
    if (scene.anims.exists(key)) return;
    const frames = [];
    for (let i = 0; i < count; i++) frames.push({ key: prefix(i), frame: 0 });
    scene.anims.create({
      key, frames,
      frameRate: cfg.fps || 12,
      repeat: cfg.type === "once" ? 0 : (cfg.repeat === -1 ? -1 : cfg.repeat ?? -1),
      yoyo: !!cfg.yoyo
    });
    made.push(key);
  };
  for (const [char, def] of Object.entries(manifest.characters)) {
    const src = sourceOf(manifest, char);
    for (const [action, a] of Object.entries(def.actions)) {
      build(animKey(char, action), (i) => frameKey(src, action, i), a.frames, a);
    }
  }
  for (const [fx, a] of Object.entries(manifest.fx || {})) {
    build(`fx_${fx}`, (i) => frameKey("fx", fx, i), a.frames, { ...a, type: "once" });
  }
  scene.registry.set("animKeys", made);
  return made;
}

/**
 * 状态机：每个 sprite 记住当前动作，切换时遵守 transitions 白名单。
 * 用法：const an = new Animator(scene, manifest); an.play(player, "player", "run");
 */
export class Animator {
  constructor(scene, manifest) {
    this.scene = scene;
    this.manifest = manifest;
    this.transitions = manifest.transitions || null;
  }

  /** @returns {boolean} 是否真的切换了动画 */
  play(target, char, action, opts = {}) {
    const a = this.manifest.characters?.[char]?.actions?.[action];
    if (!a) { console.warn(`[animator] 未登记的动作 ${char}.${action}`); return false; }
    const key = animKey(char, action);
    if (target.anims.currentAnim?.key === key && !opts.force) return false;
    if (!opts.force && this.transitions?.[target.anims.currentAnim?.key?.replace(`${char}_`, "")]?.includes?.(action) === false) {
      return false;                                     // 白名单外状态：等当前一次性动作播完
    }
    target.setData("pgAction", action);
    target.play(key, !!opts.ignoreIfPlaying === false && !!opts.restart);
    if (a.type === "once") {
      target.once(`animationcomplete-${key}`, () => {
        if (target.getData("pgAction") !== action) return;
        const next = a.next ?? "idle";
        if (next && this.manifest.characters[char].actions[next]) this.play(target, char, next);
      });
    }
    if (a.mirrorFlip) target.setFlipX(target.body?.velocity?.x < 0);
    return true;
  }

  current(target) { return target.getData("pgAction") || target.anims.currentAnim?.key || ""; }
  isPlaying(target, action) { return this.current(target) === action; }
  fps(target, rate) { if (target.anims.currentAnim) target.anims.currentAnim.frameRate = rate; return target; }
}

/** 生成角色实例：统一按清单取底图纹理、复用角色的换色 tint 与缩放 */
export function makeSprite(scene, manifest, char, x, y) {
  const def = manifest.characters[char];
  const first = Object.keys(def.actions)[0];
  const texture = frameKey(sourceOf(manifest, char), first, 0);
  const sp = scene.add.sprite(x, y, texture);
  if (def.tint != null) sp.setTint(def.tint);                 // 换色复用：setTint 而非重画
  sp.setData("pgChar", char);
  return sp;
}

/** 打击/受击特效：只能用逐帧透明 PNG 光效，禁止描边框、setTintFill、Graphics 常亮 */
export function playFx(scene, name, x, y, opts = {}) {
  const key = `fx_${name}`;
  if (!scene.anims.exists(key)) { console.warn(`[animator] 缺少光效 ${name}`); return null; }
  const sp = scene.add.sprite(x, y, `f_fx_${name}_01`);    // 必须用 Sprite：Image 无 Animation 组件，play() 不存在
  if (opts.scale) sp.setScale(opts.scale);
  if (opts.tint) sp.setTint(opts.tint);                    // setTint 允许，setTintFill 禁止
  sp.setDepth(opts.depth ?? 10);
  sp.play(key);
  sp.once(`animationcomplete-${key}`, () => sp.destroy()); // 播完必须销毁，避免残影
  return sp;
}
