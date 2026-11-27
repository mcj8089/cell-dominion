// src/main.js — 启动：引擎就绪 → 域名锁 → 逐帧清单 → Phaser 初始化（响应式横屏铺满）
// 引擎来自 index.html 的 UMD <script>（本地优先、线上兜底），只挂 window.Phaser，
// 没有 ESM 默认导出：禁止 import Phaser from "phaser"。
const Phaser = window.Phaser;
const setBootTip = (msg) => {
  const el = document.getElementById("boot-tip");
  if (el) el.textContent = msg;
};
if (!Phaser) {
  setBootTip("Engine failed to load (lib/phaser.4.2.1.min.js)");
  throw new Error("Phaser 未加载：检查 index.html 的本地引擎副本与线上兜底脚本");
}

// 看门狗：启动链任何一步静默卡住时给出可诊断提示，避免无限停在加载页
const watchdog = setTimeout(() => {
  const boot = document.getElementById("boot");
  if (boot && !boot.classList.contains("is-done")) {
    setBootTip("Still loading? Open DevTools (F12) and check Network / Console.");
    console.warn("[boot] 启动超过 12 秒仍未完成，请检查控制台与网络请求");
  }
}, 12000);

(async () => {
  try {
    const { enforceDomainLock } = await import("core/domainlock.js");
    enforceDomainLock();                                    // 非授权域名：3 秒后跳 pipygames.com

    const { GAME } = await import("config/game.config.js");
    const { UI } = await import("ui/ui.js");
    const { MainScene } = await import("game/main.js");
    // 场景类缺失时 Phaser 4 会在插件初始化阶段抛 "Cannot read properties of undefined (reading 'sys')"，
    // 极难定位（常见于 importmap 失效 / 浏览器缓存了旧脚本 / Service Worker 劫持），这里提前给出可读错误。
    if (typeof MainScene !== "function") {
      throw new Error("MainScene missing: check importmap, cached scripts or Service Worker");
    }
    const { ensureMeta } = await import("core/share.js");
    const { whenReady } = await import("core/ads.js");
    const { resumeContext } = await import("core/audio.js");

    ensureMeta({
      title: document.title.replace(" | pipygames.com", ""),
      description: document.querySelector('meta[name="description"]')?.content || "",
      image: `poster.jpg`
    });

    // 清单请求带超时 + 状态校验：缺文件 / 返回错误页时立刻报错，不再静默卡在加载页
    const timeoutSignal = (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function")
      ? AbortSignal.timeout(8000) : undefined;
    const res = await fetch(GAME.frames.manifest, { cache: "no-store", signal: timeoutSignal });
    if (!res.ok) throw new Error(`frame-manifest.json HTTP ${res.status}`);
    const frameManifest = await res.json();

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: "game-root",
      backgroundColor: "#0b0d14",                       // 仅作画布底色，画面内容由背景 PNG 铺满（红线 8）
      width: GAME.design.width,
      height: GAME.design.height,
      scale: {
        mode: Phaser.Scale.FIT,                         // 等比铺满视口：PC 与移动端共用同一设计分辨率
        autoCenter: Phaser.Scale.CENTER_BOTH
      },
      physics: { default: "arcade", arcade: { gravity: { y: GAME.play.gravity }, debug: false } },  // debug 必须 false（红线 6/17）
      render: { antialias: true, roundPixels: false },
      fullscreenTarget: document.getElementById("stage")
    });

    // 逐帧清单在启动前已取到，用 scene data 注入 MainScene.init(data)。
    // 注意：Phaser 4 的 scene.start(key) 即使省略 data 也会把运行期 data 置为 undefined，
    // 覆盖 add() 阶段存入的数据，因此必须在 start() 时把 data 一并传入。
    game.scene.add("main", MainScene, false, { frameManifest });
    game.scene.start("main", { frameManifest });

    // 首次交互解锁 WebAudio（浏览器自动播放策略）
    const unlock = () => { resumeContext(); document.removeEventListener("pointerdown", unlock); };
    document.addEventListener("pointerdown", unlock);

    whenReady().then((ok) => { if (!ok) console.warn("[boot] pipysdk 未就绪，广告按钮自动隐藏"); });
  } catch (err) {
    clearTimeout(watchdog);
    console.error("[boot] 启动失败：", err);
    setBootTip(`Load failed: ${err?.message || err}`);
  }
})();
