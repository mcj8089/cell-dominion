// src/game/units.js — 派兵部队：从出发节点散兵线飞向目标节点，抵达即结算。
// 表现全部由逐帧 PNG（unit_idle 循环）驱动，绝不用纯色方块代替。
import { GAME } from "config/game.config.js";
import { SIDE_COLORS } from "game/cells.js";
import { DEPTH } from "art/theme.js";
import { makeSprite } from "core/animator.js";
import { sfx } from "core/audio.js";

const Phaser = window.Phaser;

const LIFE = 12;           // 单兵最长在飞行时间（秒），超时自动消散，防止无限漂移
const OUT = 60;            // 出界回收边距
const SPREAD = 9;          // 散兵线相邻出生位横向间距（px）
const MAX_SPREAD = 72;     // 散兵线最大半宽（px）：出生错位只做观感，不做命中偏移
const WOBBLE_RANGE = 14;   // 出生时的航向抖动上限（度），飞行中随距离收敛
const WOBBLE_DIST = 260;   // 抖动收敛距离：小于该距离后完全对准目标

export class UnitManager {
  constructor(scene, animator, manifest) {
    this.scene = scene;
    this.animator = animator;
    this.manifest = manifest;
    this.list = [];
    this.hitGap = 0;       // 命中音效/光效最小间隔（秒）
  }

  /** 派兵：n 个个体按散兵线排布，出生错位形成"一队人冲过去"的观感；
   *  飞行中每帧朝目标转向（附近距离内对准），保证派出的部队必然抵达目标节点。
   *  注意：不能用固定初速直线航行——散兵线的侧向错位会让大部分部队从目标旁边飞过。 */
  spawn(from, target, n, side) {
    const room = Math.max(0, GAME.play.unitCap - this.list.length);
    const count = Math.min(Math.floor(n), room);
    if (count <= 0) return 0;
    const base = Math.atan2(target.y - from.y, target.x - from.x);
    const perp = base + Math.PI / 2;
    for (let i = 0; i < count; i++) {
      const speed = GAME.play.unitSpeed + Phaser.Math.Between(-GAME.play.unitSpeedJitter, GAME.play.unitSpeedJitter);
      const lane = Phaser.Math.Clamp((i - (count - 1) / 2) * SPREAD, -MAX_SPREAD, MAX_SPREAD);
      const x = from.x + Math.cos(base) * (from.radius + 3) + Math.cos(perp) * lane;
      const y = from.y + Math.sin(base) * (from.radius + 3) + Math.sin(perp) * lane;
      const sp = makeSprite(this.scene, this.manifest, "unit", x, y);
      sp.setDisplaySize(GAME.play.unitRadius * 3.6, GAME.play.unitRadius * 3.6).setDepth(DEPTH.entity);
      sp.setTint(SIDE_COLORS[side] ?? SIDE_COLORS[0]);
      this.animator.play(sp, "unit", "idle");
      this.list.push({
        sp: sp, side: side, target: target, speed: speed,
        wobble: Phaser.Math.DegToRad(Phaser.Math.Between(-WOBBLE_RANGE, WOBBLE_RANGE)),
        life: LIFE + (i % 5) * .2
      });
    }
    return count;
  }

  update(dt) {
    this.hitGap = Math.max(0, this.hitGap - dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const u = this.list[i];
      u.life -= dt;
      const t = u.target;
      // 转向追踪：出生时的航向抖动按剩余距离线性收敛，越接近目标越准，最终必然命中
      const far = Phaser.Math.Distance.Between(u.sp.x, u.sp.y, t.x, t.y);
      const aim = Math.atan2(t.y - u.sp.y, t.x - u.sp.x) + u.wobble * Math.min(1, far / WOBBLE_DIST);
      u.sp.x += Math.cos(aim) * u.speed * dt;
      u.sp.y += Math.sin(aim) * u.speed * dt;
      if (!t.dead && Phaser.Math.Distance.Between(u.sp.x, u.sp.y, t.x, t.y) <= t.radius + GAME.play.unitRadius) {
        const res = t.hit(u.side);
        // 翻面自带 capture 光效；普通命中按节流播 hit，防止几十支部队同时抵达刷屏
        if (!res.flipped && this.hitGap <= 0) {
          this.scene.playFxAt("hit", u.sp.x, u.sp.y, .5, SIDE_COLORS[u.side]);
          sfx("sfx_hit", { volume: .4 });
          this.hitGap = GAME.play.hitSfxGapMs / 1000;
        }
        this.retire(i);
        continue;
      }
      if (u.life <= 0 || u.sp.x < -OUT || u.sp.x > GAME.design.width + OUT || u.sp.y < -OUT || u.sp.y > GAME.design.height + OUT) {
        this.retire(i);
      }
    }
  }

  retire(i) {
    this.list[i].sp.destroy();
    this.list.splice(i, 1);
  }

  /** 在飞部队数量：算进势力总兵力，避免"部队还在路上却被判失败/过关" */
  countBySide(side) {
    let n = 0;
    for (const u of this.list) if (u.side === side) n++;
    return n;
  }

  clear() {
    this.list.forEach((u) => u.sp.destroy());
    this.list.length = 0;
    this.hitGap = 0;
  }
}