// src/game/cells.js — 战场节点：阵营色圆环 + 中心兵力数字，负责翻面占领结算与成长。
// 全部图形由 PNG（cell_body / face_NN）+ Phaser Ellipse 描边 + Text 组成，
// 不使用 Graphics / lineStyle / setTintFill（红线静态检查）。
import { GAME } from "config/game.config.js";
import { DEPTH } from "art/theme.js";
import { sfx } from "core/audio.js";

/** 0 中立（灰）/ 1 玩家（洋红）/ 2-5 敌方四色，与关卡表 side 一一对应 */
export const SIDE_COLORS = [0x9aa6b2, 0xff2fa0, 0x2ce0ff, 0xffb020, 0xa855f7, 0x2ee6a8];
export const SIDE_COUNT = SIDE_COLORS.length;

/** 节点底纹：12 张 face_NN 循环取用，避免整盘节点长得一样 */
export const faceKey = (i) => `face_${String((((i - 1) % 12 + 12) % 12) + 1).padStart(2, "0")}`;

const colorOf = (side) => SIDE_COLORS[side] ?? SIDE_COLORS[0];
const sizeOf = (power) =>
  GAME.play.cellSizeMin + (GAME.play.cellSizeMax - GAME.play.cellSizeMin) * (power / GAME.play.cellPowerMax);

export class Cell {
  constructor(scene, cfg, index) {
    this.scene = scene;
    this.side = cfg.side;
    this.power = cfg.power;
    this.index = index;
    this.x = cfg.x;
    this.y = cfg.y;
    this.max = GAME.play.cellPowerMax;
    this.growTimer = 0;
    this.dead = false;

    const d = GAME.play.cellRadius * sizeOf(this.power) * 2;
    this.radius = d / 2;
    const col = colorOf(this.side);

    this.body = scene.add.image(0, 0, "cell_body").setDisplaySize(d, d).setTint(col);          // 底色：同张图按阵营 tint
    this.face = scene.add.image(0, 0, faceKey(index)).setDisplaySize(d * .56, d * .56).setAlpha(.5).setTint(col);
    this.ring = scene.add.ellipse(0, 0, d, d, 0x000000, 0).setStrokeStyle(Math.max(3, d * .06), col, .95);
    this.label = scene.add.text(0, 0, String(Math.round(this.power)), {
      fontFamily: "Baloo 2, Nunito, system-ui, Microsoft YaHei, sans-serif",
      fontSize: "26px", color: "#ffffff", fontStyle: "bold"
    }).setOrigin(.5);
    this.label.setStroke("#10131c", 8);
    this.box = scene.add.container(this.x, this.y, [this.body, this.face, this.ring, this.label]).setDepth(DEPTH.entity);
    this.refresh();
  }

  /** 兵力变化后同步尺寸 / 颜色 / 数字（数字走 Text，不做 UI 贴图） */
  refresh() {
    const d = GAME.play.cellRadius * sizeOf(this.power) * 2;
    this.radius = d / 2;
    const col = colorOf(this.side);
    this.body.setDisplaySize(d, d).setTint(col);
    this.face.setDisplaySize(d * .56, d * .56).setTint(col);
    this.ring.setDisplaySize(d, d).setStrokeStyle(Math.max(3, d * .06), col, .95);
    this.label.setText(String(Math.max(0, Math.round(this.power))));
    this.label.setFontSize(Math.max(16, Math.round(d * .58)));
    this.box.setAlpha(this.side === 0 ? .92 : 1);
  }

  /** 一个部队命中本节点：同色 +1，异色 -1，归零翻面（对齐 Step 1 源码事实） */
  hit(side) {
    const wasNeutral = this.side === 0;
    let flipped = false;
    if (side === this.side) {
      this.power = Math.min(this.max, this.power + 1);
    } else {
      this.power -= 1;
      if (this.power <= 0) { this.capture(side); flipped = true; }
    }
    if (!flipped) this.refresh();
    return { flipped: flipped, wasNeutral: wasNeutral, by: side };
  }

  /** 翻面：变色 + 保留余量兵力；光效与音效在这里播，玩家占领回调给场景结算金币 */
  capture(side) {
    const wasNeutral = this.side === 0;
    this.side = side;
    this.power = Math.min(this.max, Math.max(1, Math.abs(this.power)));
    this.refresh();
    sfx("sfx_capture", { volume: .65 });
    this.scene.playFxAt("capture", this.x, this.y, Math.min(1.4, .7 + this.radius / 60), colorOf(side), true);
    if (side === 1) this.scene.onPlayerCapture(this, wasNeutral);
  }

  /** 兵力成长：中立不成长；返回值表示本帧是否真的 +1（供光效节流） */
  growUpdate(dt) {
    if (this.side === 0 || this.power >= this.max) return false;
    this.growTimer += dt;
    if (this.growTimer < GAME.play.growthSeconds) return false;
    this.growTimer -= GAME.play.growthSeconds;
    this.power = Math.min(this.max, this.power + 1);
    this.refresh();
    return true;
  }

  /** 派兵：留下 1 点守军，其余全部出征；按实际起飞数量扣减，避免部队上限截断时兵力凭空消失 */
  attack(target) {
    if (!target || target === this || target.dead) return 0;
    const n = Math.floor(this.power) - 1;
    if (n <= 0) return 0;
    const sent = this.scene.units.spawn(this, target, n, this.side);
    if (sent <= 0) return 0;
    this.power -= sent;
    this.refresh();
    sfx("sfx_attack", { volume: .45 });
    return sent;
  }

  destroy() {
    this.dead = true;
    this.box.destroy(true);
  }
}