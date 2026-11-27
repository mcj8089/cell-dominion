// src/core/ads.js — 广告与奖励：统一走线上 pipysdk（https://pipygames.com/sdk/pipysdk.min.js）
// 必须提供 复活 / 获得更多机会 / 额外奖励 三类入口，看完广告才发奖励。
// API 依据 references/pipysdk-developer-guide.md，禁止凭猜测调用不存在的方法。

const G = () => window.PipyGames;

export const AdPlacement = {
  revive: "revive",          // 激励视频，每局 1 次
  doubleCoins: "doubleCoins",// 激励视频，结算翻倍
  stageClear: "stageClear",  // 插屏，每 3 关 1 次
  gameOver: "gameOver"       // 插屏，默认关闭
};

/** SDK 就绪（pipysdk 为异步脚本，需等它挂载；离线时降级为无广告，返回 false） */
export async function whenReady(timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (!G() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 80));   // 等异步 SDK 挂载，不阻塞游戏启动
  }
  const g = G();
  if (!g) return false;
  const left = Math.max(1000, deadline - Date.now());
  try { await Promise.race([g.ready, new Promise((_, r) => setTimeout(() => r(new Error("sdk timeout")), left))]); return true; }
  catch { console.warn("[ads] pipysdk 未就绪，广告按钮将隐藏"); return false; }
}

/**
 * 播激励视频。
 * @param {string} placement
 * @param {(ok:boolean)=>void} onReward 仅在 ok=true 时由调用方发放奖励
 * @returns {Promise<boolean>}
 */
export async function rewarded(placement, onReward) {
  const g = G();
  if (!g?.showRewarded) { onReward?.(false); return false; }
  const ok = await g.showRewarded(placement);
  if (ok) onReward?.(true);
  return !!ok;
}

export function canShow(placement) {
  const g = G();
  if (!g) return false;                 // SDK 未加载：不出现任何广告按钮，流程自动降级
  try { return g.canShowAd?.(placement) !== false; } catch { return true; }
}

/** 广告期间暂停 + 静音（SDK 文档 §4） */
export function bindGamePause(pause, resume, muteFn, unmuteFn) {
  const g = G();
  if (!g) return;
  g.onAdStart?.(() => { muteFn?.(); pause(); });
  g.onAdEnd?.(() => { unmuteFn?.(); resume(); });
}

/** 局生命周期：开局 newRun / 过关 levelCleared（含插屏频控）/ 失败 gameOver */
export function runStart(payload) { try { G()?.newRun?.(); } catch { /* noop */ } G()?.track?.("run_start", payload); }
export function levelCleared(payload) { const g = G(); if (!g) return; g.levelCleared?.(payload); g.showInterstitial?.(AdPlacement.stageClear, payload); }
export function runFail(payload) { const g = G(); if (!g) return; g.gameOver?.(payload); g.showInterstitial?.(AdPlacement.gameOver, payload); }
export function track(name, payload) { try { G()?.track?.(name, payload); } catch { /* noop */ } }
