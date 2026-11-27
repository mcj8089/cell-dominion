// config/levels.js — 关卡表（24 关 ≥ 20，红线 14）。
// 每关 = 一组节点 { x, y, side, power }：
//   side 0 中立（不成长）/ side 1 玩家 / side 2-5 敌方（各自独立成长与 AI）。
// 坐标在 1280×720 设计空间内手摆；难度曲线：前 3 关教学 → 4-8 关引入第二敌种 →
// 9+ 关组合施压 → 每 5 关里程碑（新敌种/更多阵营）→ 结尾靠 AI 频率与起始兵力施压，不出现断崖。

export const SIDE_NEUTRAL = 0;
export const SIDE_PLAYER = 1;

/* —— 手摆槽位（已按节点最大半径 41px 校核，任意两槽间距 > 150px，永不重叠）—— */
const SLOT_PLAYER = { x: 150, y: 360 };
const SLOT_ENEMY = [
  { x: 1128, y: 176 },
  { x: 1128, y: 544 },
  { x: 1008, y: 360 },
  { x: 1008, y: 76 }
];
const SLOT_NEUTRAL = [
  { x: 340, y: 160 }, { x: 340, y: 300 }, { x: 340, y: 440 }, { x: 340, y: 580 },
  { x: 470, y: 160 }, { x: 470, y: 300 }, { x: 470, y: 440 }, { x: 470, y: 580 },
  { x: 600, y: 160 }, { x: 600, y: 300 }, { x: 600, y: 440 }, { x: 600, y: 580 },
  { x: 730, y: 160 }, { x: 730, y: 300 }, { x: 730, y: 440 }, { x: 730, y: 580 },
  { x: 860, y: 160 }, { x: 860, y: 300 }, { x: 860, y: 440 }, { x: 860, y: 580 }
];

/* 关卡参数：p 我方起始兵力 / e 敌方兵力系数 / n 中立节点数 / nmax 中立兵力上限 /
   bg 背景 / ai [[AI 类型, 决策间隔下限秒, 上限秒], …]，第 k 个 AI 占用第 k 号敌方槽位 side = 2+k */
const SPECS = [
  { p: 30, e: 0.60, n: 2,  nmax: 15, bg: "bg_arena_dish",   ai: [["Noob", 6, 9], ["Noob", 6, 9]] },
  { p: 30, e: 0.61, n: 3,  nmax: 15, bg: "bg_arena_dish",   ai: [["Noob", 6, 9], ["Noob", 6, 9]] },
  { p: 30, e: 0.62, n: 4,  nmax: 15, bg: "bg_arena_dish",   ai: [["Noob", 5, 8], ["Noob", 5, 8]] },
  { p: 30, e: 0.63, n: 5,  nmax: 15, bg: "bg_arena_dish",   ai: [["Noob", 5, 8], ["Noob", 5, 8]] },
  { p: 30, e: 0.68, n: 6,  nmax: 15, bg: "bg_arena_dish",   ai: [["Noob", 5, 8], ["Easy", 6, 9]] },
  { p: 35, e: 0.65, n: 6,  nmax: 20, bg: "bg_arena_dish",   ai: [["Easy", 6, 9], ["Easy", 6, 9]] },
  { p: 35, e: 0.66, n: 7,  nmax: 20, bg: "bg_arena_dish",   ai: [["Easy", 5, 8], ["Easy", 5, 8]] },
  { p: 35, e: 0.67, n: 7,  nmax: 20, bg: "bg_arena_dish",   ai: [["Easy", 5, 8], ["Easy", 5, 8]] },
  { p: 35, e: 0.68, n: 8,  nmax: 20, bg: "bg_arena_fluid",  ai: [["Easy", 4, 8], ["Easy", 4, 8]] },
  { p: 40, e: 0.72, n: 8,  nmax: 20, bg: "bg_arena_fluid",  ai: [["Easy", 4, 8], ["Easy", 4, 8], ["Easy", 4, 8]] },
  { p: 40, e: 0.70, n: 8,  nmax: 25, bg: "bg_arena_fluid",  ai: [["Easy", 5, 9], ["Easy", 5, 9], ["Easy", 5, 9]] },
  { p: 40, e: 0.71, n: 8,  nmax: 25, bg: "bg_arena_fluid",  ai: [["Easy", 5, 9], ["Easy", 5, 9], ["Easy", 5, 9]] },
  { p: 40, e: 0.72, n: 9,  nmax: 25, bg: "bg_arena_fluid",  ai: [["Easy", 4, 7], ["Noob", 4, 7], ["Noob", 4, 7]] },
  { p: 45, e: 0.73, n: 10, nmax: 25, bg: "bg_arena_fluid",  ai: [["Easy", 4, 7], ["Easy", 4, 7]] },
  { p: 45, e: 0.78, n: 9,  nmax: 25, bg: "bg_arena_fluid",  ai: [["Smart", 4, 8], ["Easy", 4, 8], ["Easy", 4, 8]] },
  { p: 45, e: 0.75, n: 10, nmax: 25, bg: "bg_arena_fluid",  ai: [["Easy", 3, 6], ["Easy", 3, 6], ["Noob", 3, 6]] },
  { p: 50, e: 0.76, n: 9,  nmax: 30, bg: "bg_arena_dish",   ai: [["Smart", 3, 7], ["Easy", 3, 7], ["Easy", 3, 7]] },
  { p: 50, e: 0.77, n: 10, nmax: 30, bg: "bg_arena_dish",   ai: [["Easy", 3, 7], ["Easy", 3, 7], ["Easy", 3, 7]] },
  { p: 50, e: 0.78, n: 10, nmax: 30, bg: "bg_arena_dish",   ai: [["Smart", 3, 7], ["Smart", 3, 7], ["Easy", 3, 7]] },
  { p: 50, e: 0.82, n: 10, nmax: 30, bg: "bg_arena_fluid",  ai: [["Smart", 3, 6], ["Smart", 3, 6], ["Noob", 3, 6], ["Noob", 3, 6]] },
  { p: 55, e: 0.80, n: 11, nmax: 30, bg: "bg_arena_fluid",  ai: [["Smart", 2, 6], ["Smart", 2, 6], ["Easy", 2, 6]] },
  { p: 55, e: 0.80, n: 11, nmax: 35, bg: "bg_arena_colony", ai: [["Smart", 2, 6], ["Smart", 2, 6], ["Easy", 2, 6], ["Easy", 2, 6]] },
  { p: 60, e: 0.80, n: 12, nmax: 35, bg: "bg_arena_colony", ai: [["Smart", 2, 5], ["Smart", 2, 5], ["Smart", 2, 5], ["Easy", 2, 5]] },
  { p: 60, e: 0.80, n: 13, nmax: 35, bg: "bg_arena_colony", ai: [["Smart", 2, 5], ["Smart", 2, 5], ["Smart", 2, 5], ["Smart", 2, 5]] }
];

/** 组装单关节点：1 个玩家节点 + 每个 AI 一个敌方节点 + n 个中立节点（坐标取手摆槽位，按关号错开排布） */
function cellsOf(spec, id) {
  const cells = [{ x: SLOT_PLAYER.x, y: SLOT_PLAYER.y, side: SIDE_PLAYER, power: spec.p }];
  spec.ai.forEach(([type, min, max], k) => {
    const slot = SLOT_ENEMY[k];
    cells.push({
      x: slot.x, y: slot.y, side: 2 + k,
      power: Math.min(100, Math.round(spec.p * spec.e)),
      ai: { type, min, max }
    });
  });
  const steps = Math.max(1, Math.floor(spec.nmax / 5));
  for (let i = 0; i < spec.n; i++) {
    const slot = SLOT_NEUTRAL[(i * 3 + id * 5) % SLOT_NEUTRAL.length];
    cells.push({ x: slot.x, y: slot.y, side: SIDE_NEUTRAL, power: 5 * (1 + ((i * 7 + id * 13) % steps)) });
  }
  return cells;
}

export const LEVELS = Array.from({ length: 24 }, (_, k) => {
  const id = k + 1;
  const spec = SPECS[k];
  return {
    id: id,
    name: { en: `Stage ${id}`, zh: `第 ${id} 关` },
    milestone: id % 5 === 0,          // 每 5 关一个里程碑（新敌种 / 新阵营 / 更多阵营）
    bg: spec.bg,
    cells: cellsOf(spec, id)
  };
});

export const LEVEL_COUNT = LEVELS.length;