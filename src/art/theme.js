// src/art/theme.js — 美术层：把美术基调落到 CSS 变量与场景纹理，保证 UI 与画面同风格
import { GAME } from "config/game.config.js";

/** UI 材质主题：只改 CSS 变量，不生成任何 UI 图片 */
export function applyTheme({ hue = GAME.theme.hue } = {}) {
  document.documentElement.style.setProperty("--hue", String(hue));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", `hsl(${hue} 55% 16%)`);
}

/** 关卡 -> 背景纹理与色调偏移；同一张背景图靠 Phaser tint 出变体，不额外产图 */
export const LEVEL_LOOK = {
  bg_arena_dish: { tint: 0xffffff, alpha: 1, far: 0xffd9f2 },
  bg_arena_fluid: { tint: 0xd8f4ff, alpha: .97, far: 0x9fe0ff },
  bg_arena_colony: { tint: 0xffe3f4, alpha: .98, far: 0xc7a9ff }
};

export function lookFor(bgKey) { return LEVEL_LOOK[bgKey] || LEVEL_LOOK.bg_arena_colony; }

export const DEPTH = { bg: 0, far: 1, platform: 2, prop: 3, entity: 5, fx: 10, top: 20 };