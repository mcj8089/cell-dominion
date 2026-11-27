// src/game/ai.js — 敌方指挥官：按 choose 周期用己方兵力最厚的节点派兵。
// 三档性格对齐源实现（Noob / Easy / Smart）；源实现里 Hard、Impossible 为空，故不提供。
import { SIDE_PLAYER } from "config/levels.js";

export const AI_TYPES = ["Noob", "Easy", "Smart"];

const dist2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

export class Brain {
  constructor(scene, cell, cfg) {
    this.scene = scene;
    this.cell = cell;                    // 出生节点（可能被玩家翻面，但阵营身份不变）
    this.side = cell.side;               // 锁死阵营编号：节点易主后这个大脑就不再指挥
    this.type = AI_TYPES.includes(cfg.type) ? cfg.type : "Noob";
    this.min = Number(cfg.min ?? 4);
    this.max = Math.max(this.min, Number(cfg.max ?? 7));
    this.timer = this.min * .6 + Math.random() * (this.max - this.min) * .5;
  }

  /** 还有兵力才算存活：全部节点易主且在途部队清零后，该阵营静默（不再出兵） */
  alive() { return this.scene.totalFor(this.side) > 0; }

  update(dt) {
    if (!this.alive()) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.min + Math.random() * (this.max - this.min);
    this.decide();
  }

  mine() { return this.scene.cells.filter((c) => c.side === this.side && c.power > 1 && !c.dead); }

  nearest(list, from) {
    let best = null;
    let bd = Infinity;
    for (const c of list) {
      const d = dist2(c, from);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  pick(src) {
    const neutrals = this.scene.cells.filter((c) => c.side === 0 && !c.dead);
    const enemies = this.scene.cells.filter((c) => c.side !== 0 && c.side !== this.side && !c.dead);
    const weakest = enemies.slice().sort((a, b) => a.power - b.power);

    if (this.type === "Smart") {
      const soft = weakest.find((c) => c.power <= src.power * 1.2);      // 只挑打得动的
      if (soft && Math.random() < .45) return soft;
      return this.nearest(neutrals, src) || soft || weakest[0] || null;
    }
    if (this.type === "Easy") {
      return this.nearest(neutrals, src) || this.nearest(enemies, src) || null;
    }
    const n = this.nearest(neutrals, src);                              // Noob：只认中立，无中立时大概率发呆
    if (n) return n;
    if (enemies.length && Math.random() < .35) return this.nearest(enemies, src);
    return null;
  }

  decide() {
    const pool = this.mine();
    if (!pool.length) return;
    const src = pool.sort((a, b) => b.power - a.power)[0];
    const target = this.pick(src);
    if (target) src.attack(target);
  }
}