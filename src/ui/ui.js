// src/ui/ui.js — DOM 覆盖层：菜单 / HUD / 引导 / 结算 / 分享。
// 全部控件由 styles.css 的材质组件渲染（零 UI 生图），文案一律走 i18n 的 t()。
import { t } from "core/i18n.js";
import { open as shareOpen, PLATFORMS, inviteText } from "core/share.js";
import { rewarded, canShow, track } from "core/ads.js";
import { store } from "core/storage.js";

const root = () => document.getElementById("ui-root");
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

/** 文字写入统一走 textContent，昵称等用户输入绝不拼进 innerHTML */
function button(labelKey, variant = "", onClick, iconSvg = "") {
  const b = el("button", `btn ${variant}`);
  if (iconSvg) { const i = el("span", "btn__icon"); i.innerHTML = iconSvg; b.appendChild(i); }   // 图标只允许内置常量 SVG
  const s = el("span", "btn__label", t(labelKey));
  b.appendChild(s);
  b.addEventListener("click", onClick);
  return b;
}

const ICONS = {
  play: '<svg class="btn__icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  share: '<svg class="btn__icon" viewBox="0 0 24 24"><path d="M18 8a3 3 0 10-2.83-4H15a3 3 0 00.17 4L9.4 11.7A3 3 0 109 15.3l5.75 3.06A3 3 0 1016 16l-5.6-3 5.75-3.06z"/></svg>',
  home: '<svg class="btn__icon" viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-5H9v5H5a1 1 0 01-1-1z"/></svg>',
  levels: '<svg class="btn__icon" viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>',
  help: '<svg class="btn__icon" viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2zm.4-4.2c-.5.4-.9.7-.9 1.4h-2c0-1.3.7-2 1.4-2.6.6-.5.6-.9.6-1.4a1.8 1.8 0 00-3.6.2H7.4A3.8 3.8 0 0111 6.8c2 0 3.6 1.2 3.6 3 0 1.4-.9 2.1-1.2 2.8z"/></svg>',
  pause: '<svg class="btn__icon" viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
  extra: '<svg class="btn__icon" viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z"/></svg>',
  sound: '<svg class="btn__icon" viewBox="0 0 24 24"><path d="M4 9h3l4-4v14l-4-4H4z" /><path d="M15.6 9.4a3.6 3.6 0 010 5.2l1.4 1.4a5.5 5.5 0 000-8z" /><path d="M17.9 6.6a7.5 7.5 0 010 10.8l1.4 1.4a9.4 9.4 0 000-13.6z" /></svg>',
  soundOff: '<svg class="btn__icon" viewBox="0 0 24 24"><path d="M4 9h3l4-4v14l-4-4H4z" /><path d="M15 9.2l1.5-1.5 2 2 2-2 1.5 1.5-2 2 2 2-1.5 1.5-2-2-2 2-1.5-1.5 2-2z" /></svg>'
};

/** 角落图标按钮：只显示图标（aria-label 供读屏），用于可省略的次要动作 */
function iconBtn(labelKey, iconKey, onClick) {
  const b = el("button", "btn btn--ghost btn--bare");
  b.setAttribute("aria-label", t(labelKey));
  b.title = t(labelKey);
  const i = el("span", "btn__icon"); i.innerHTML = ICONS[iconKey] || ICONS.share;   // 图标只允许内置常量 SVG
  b.appendChild(i);
  b.addEventListener("click", onClick);
  return b;
}

/** 角落动作收纳区：把可省略的次要按钮（分享/关卡/帮助/主页）收成图标 */
function corner(actions) {
  const c = el("div", "corner-actions");
  actions.forEach((a) => c.appendChild(a));
  return c;
}

/** 引导页机制演示：己方节点 →(虚线箭头)→ 敌方节点，下方是 +1 / -1 / 0 结算规则 */
function guideDemo() {
  const demo = el("div", "guide__demo");
  const row = el("div", "guide__demo-row");
const arrow = el("span", "demo-arrow");
  arrow.innerHTML = '<svg viewBox="0 0 64 20" aria-hidden="true"><path class="demo-arrow__line" d="M4 10h44"/><path class="demo-arrow__head" d="M44 3l12 7-12 7z"/><circle class="demo-arrow__troop" cx="8" cy="10" r="4.5"/></svg>';
  row.append(el("span", "demo-cell demo-cell--own", "6"), arrow, el("span", "demo-cell demo-cell--foe", "3"));
  const chips = el("div", "guide__demo-chips");
  chips.append(
    el("span", "demo-chip demo-chip--same", "+1"),
    el("span", "demo-chip demo-chip--other", "-1"),
    el("span", "demo-chip demo-chip--zero", "0")
  );
  demo.append(row, chips);
  return demo;
}

export const UI = {
  onAction: null,          // (action, payload) => void：init() 里由动作表包出来
  guideKey: null,
  soundMuted: false,

  /** 声音开关：图标按钮，图标与文案由 setSound 统一刷新 */
  soundBtn() {
    const b = iconBtn(this.soundMuted ? "menu.muted" : "menu.sound", this.soundMuted ? "soundOff" : "sound", () => this.onAction("sound"));
    b.classList.add("btn--sound");
    b.dataset.state = this.soundMuted ? "off" : "on";
    return b;
  },

  /** 同步全部声音按钮（菜单与 HUD 可能同时存在）的图标、状态与无障碍文案 */
  setSound(muted) {
    this.soundMuted = !!muted;
    const label = t(this.soundMuted ? "menu.muted" : "menu.sound");
    root().querySelectorAll(".btn--sound").forEach((b) => {
      b.dataset.state = this.soundMuted ? "off" : "on";
      b.setAttribute("aria-label", label);
      b.title = label;
      const i = b.querySelector(".btn__icon");
      if (i) i.innerHTML = this.soundMuted ? ICONS.soundOff : ICONS.sound;
    });
  },

  /** 既接受动作表对象，也接受回调函数，缺失动作静默忽略 */
  init(handlers) {
    this.handlers = typeof handlers === "function" ? null : handlers;
    this.onAction = typeof handlers === "function"
      ? handlers
      : (action, payload) => this.handlers?.[action]?.(payload);
  },

  /** 清空覆盖层 DOM：与结算面板 clear(opts) 区分开，避免同名方法互相覆盖 */
  wipe() { root().replaceChildren(); root().classList.remove("is-guiding"); document.body.classList.remove("is-menu"); },

  /* ---------- 主菜单：焦点 = 标题组 + PLAY，其余按亮度递减 ---------- */
  menu({ best = 0, coins = 0, level = 1 } = {}) {
    this.wipe();
    document.body.classList.add("is-menu");
    const panel = el("div", "panel menu");
    panel.style.margin = "auto";
    const head = el("div", "menu__head");
    head.append(el("h1", "panel__title", t("game.title")), el("p", "menu__tag", t("game.tagline")));
    panel.appendChild(head);
    const stats = el("div", "menu__stats");
    stats.append(
      el("span", "chip", `${t("hud.level")} ${level}`),
      el("span", "chip", `${t("overlay.bestLabel")} ${best}`),
      el("span", "chip", `${t("hud.coins")} ${coins}`)
    );
    panel.appendChild(stats);
    const row = el("div", "btn-row");
    row.append(button("menu.play", "btn--primary btn--big", () => this.onAction("start"), ICONS.play));
    panel.appendChild(row);
    const side = el("div", "btn-row btn-row--side");
    side.append(
      button("menu.howTo", "btn--ghost", () => this.guide(true), ICONS.help),
      button("menu.share", "btn--ghost", () => this.share({}), ICONS.share)
    );
    panel.appendChild(side);
    // 可省略的次要动作只留声音开关图标；说明与分享已升为带文字的次要按钮
    panel.appendChild(corner([this.soundBtn()]));
    root().append(el("div"), panel, el("div"));
  },

  /* ---------- HUD：关卡 / 总兵力 / 金币 / 敌方兵力 ---------- */
  hud(snap) {
    const top = el("div", "hud");
    const left = el("div", "hud__group");
    left.append(
      el("span", "chip", `${t("hud.level")} ${snap.level}`),
      el("span", "chip", `${t("hud.score")} ${snap.score}`)
    );
    const coin = el("span", "chip");
    const coinDot = el("i", "dot");
    coinDot.style.background = "#ffcf5a";
    coin.append(coinDot, document.createTextNode(` ${t("hud.coins")} ${snap.coins}`));
    left.appendChild(coin);
    const right = el("div", "hud__group");
    const foe = el("span", "chip");
    const foeDot = el("i", "dot");
    foeDot.style.background = "#7fd4ff";
    foe.append(foeDot, document.createTextNode(` ${t("hud.enemy")} ${snap.enemy}`));
    right.append(foe, this.soundBtn(), iconBtn("menu.pause", "pause", () => this.onAction("pause")));
    top.append(left, right);
    const holder = root().querySelector(".hud");
    if (holder) holder.replaceWith(top); else root().prepend(top);
  },

  /* ---------- 触屏：拖拽派兵不需要屏幕按键，只留一条手势提示 ---------- */
  touchControls() {
    if (!document.body.classList.contains("pg-touch")) return;
    const wrap = el("div", "touch-controls");
    wrap.append(el("span", "chip", t("guide.touchHint")), el("div"), el("div"));
    root().appendChild(wrap);
  },

  /* ---------- 新手引导：机制演示 + 编号步骤卡，照做后自动关闭 ---------- */
  guide(force = false, storeKey = "cd-guide-done") {
    if (!force && store.getItem(storeKey)) return false;
    const overlay = el("div", "guide");
    const card = el("div", "panel guide__card");
    const head = el("div", "guide__head");
    head.append(el("h2", "panel__title", t("guide.title")), el("p", "guide__sub", t("guide.subtitle")));
    card.append(head, guideDemo());
    const grid = el("div", "guide__grid");
    ["guide.drag", "guide.capture", "guide.grow", "guide.win"].forEach((k, i) => {
      const step = el("div", "guide__step");
      step.append(el("span", "guide__no", String(i + 1)), el("span", "guide__txt", t(k)));
      grid.appendChild(step);
    });
    card.appendChild(grid);
    const foot = el("div", "guide__foot");
    foot.append(el("kbd", "key", "Esc"), el("span", null, t("guide.pause")));
    card.appendChild(foot);
    const ok = button("guide.skip", "btn--primary btn--big pulse", () => { store.setItem(storeKey, "1"); this.closeGuide(); this.onAction("guide-done"); });
    card.appendChild(ok);
    overlay.appendChild(card);
    root().appendChild(overlay);
    // 引导期间收起主菜单：卡片与菜单按钮同在正中，避免「看不见却点不到」的拦截
    root().classList.add("is-guiding");
    this.guideKey = "active";
    return true;
  },

  /** 用户完成引导要求的操作后调用：自动关闭引导 */
  closeGuide() { const g = root().querySelector(".guide"); if (g) g.remove(); this.guideKey = null; root().classList.remove("is-guiding"); },

  /* ---------- 暂停 ---------- */
  pause() {
    const m = el("div", "modal");
    const box = el("div", "panel modal__box");
    box.appendChild(el("h2", "panel__title", t("overlay.paused")));
    const row = el("div", "btn-row");
    row.append(
      button("menu.resume", "btn--primary btn--big", () => { m.remove(); this.onAction("resume"); }),
      button("menu.restart", "btn--warn", () => { m.remove(); this.onAction("restart"); })
    );
    box.appendChild(row);
    // 次要动作收进右上角图标：分享 / 选关
    box.appendChild(corner([
      iconBtn("menu.share", "share", () => this.share({})),
      iconBtn("menu.levels", "home", () => { m.remove(); this.onAction("home"); })
    ]));
    m.appendChild(box);
    root().appendChild(m);
    return m;
  },

  /* ---------- 过关：奖励翻倍 + 下一关 ---------- */
  clear({ level, score, coins, last = false }) {
    const m = el("div", "modal");
    const box = el("div", "panel modal__box modal__box--win");
    box.append(
      el("h2", "panel__title", t("overlay.clearTitle")),
      el("p", "panel__sub", `${t("hud.level")} ${level} · ${t("overlay.scoreLabel")} ${score} · ${t("hud.coins")} ${coins}`)
    );
    const row = el("div", "btn-row");
    if (canShow("doubleCoins")) {
      row.append(button("ad.double", "btn--good", async (e) => {
        const btn = e.currentTarget; btn.disabled = true;
        const ok = await rewarded("doubleCoins", () => this.onAction("reward", { kind: "doubleCoins" }));
        if (!ok) { toast(t("ad.unavailable")); btn.disabled = false; } else toast(t("ad.rewarded"));
      }));
    }
    // 主行只放 2 个文字按钮：奖励翻倍 + 前进（末关改回主菜单）
    const primary = last
      ? { key: "overlay.finish", act: "home" }
      : { key: "overlay.next", act: "next" };
    row.append(button(primary.key, "btn--primary btn--big", () => { m.remove(); this.onAction(primary.act); }));
    box.appendChild(row);
    box.appendChild(corner([
      iconBtn("menu.share", "share", () => this.share({ score })),
      iconBtn("menu.levels", "home", () => { m.remove(); this.onAction("home"); })
    ]));
    m.appendChild(box);
    root().appendChild(m);
    return m;
  },

  /* ---------- 失败：看广告复活 + 重试 ---------- */
  fail({ level, score }) {
    const m = el("div", "modal");
    const box = el("div", "panel modal__box modal__box--danger");
    box.append(
      el("h2", "panel__title", t("overlay.failTitle")),
      el("p", "panel__sub", `${t("hud.level")} ${level} · ${t("overlay.scoreLabel")} ${score}`)
    );
    const row = el("div", "btn-row");
    const canRevive = canShow("revive");
    if (canRevive) {
      row.append(button("ad.revive", "btn--primary btn--big", async (e) => {
        const btn = e.currentTarget; btn.disabled = true;
        toast(t("ad.waiting"));
        const ok = await rewarded("revive", () => { m.remove(); this.onAction("revive"); });
        if (!ok) { toast(t("ad.unavailable")); btn.disabled = false; }
      }));
    }
    // 主行只放 1-2 个核心文字按钮；复活不可用时重试升为 big
    row.append(button("overlay.retry", canRevive ? "btn--warn" : "btn--warn btn--big", () => { m.remove(); this.onAction("restart"); }));
    box.appendChild(row);
    // 次要动作收进右上角图标：补充兵力 / 分享 / 主页
    const cornerActs = [iconBtn("ad.extraLife", "extra", async () => {
      const ok = await rewarded("revive", () => this.onAction("reward", { kind: "extraLife" }));
      if (!ok) toast(t("ad.unavailable")); else { toast(t("ad.rewarded")); m.remove(); }
    })];
    cornerActs.push(iconBtn("menu.share", "share", () => this.share({ score })));
    cornerActs.push(iconBtn("overlay.home", "home", () => { m.remove(); this.onAction("home"); }));
    box.appendChild(corner(cornerActs));
    m.appendChild(box);
    root().appendChild(m);
    return m;
  },

  /* ---------- 分享面板：昵称 + 10 平台 + 卡片下载 ---------- */
  share({ score = "", canvas = null } = {}) {
    const m = el("div", "modal");
    const box = el("div", "panel modal__box share");
    box.appendChild(el("h2", "panel__title", t("share.title")));

    const field = el("div", "share__field");
    const input = el("input", "input");
    input.placeholder = t("share.namePlaceholder");
    input.maxLength = 24;                                  // 昵称限长，防按钮/卡片文案溢出
    const preview = el("span", "panel__sub", inviteText(""));
    input.addEventListener("input", () => { preview.textContent = inviteText(input.value.trim()); });
    field.append(input);
    box.append(field, preview);

    const grid = el("div", "share__grid");
    for (const p of PLATFORMS) {
      const b = el("button", "share__item");
      const svg = el("span");
      svg.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/></svg>`; // 平台图形由 CSS/SVG 绘制
      b.append(svg, el("span", null, t(p.labelKey)));
      b.addEventListener("click", async () => {
        track("share_platform", { platform: p.id });
        await shareOpen(p.id, { name: input.value.trim(), score, canvas });
        toast(p.cardOnly ? t("share.savedImage") : t("share.copied"));
      });
      grid.appendChild(b);
    }
    box.appendChild(grid);
    const row = el("div", "btn-row");
    const copy = el("button", "btn btn--ghost");
    copy.append(el("span", "btn__label", t("share.copy")));
    copy.addEventListener("click", async () => {
      await navigator.clipboard?.writeText?.(inviteText(input.value.trim()));
      track("share_copy"); toast(t("share.copied"));
    });
    row.append(copy, button("menu.play", "btn--primary", () => m.remove()));
    box.appendChild(row);
    m.appendChild(box);
    root().appendChild(m);
    m.addEventListener("click", (e) => { if (e.target === m) m.remove(); });
    return m;
  },

  /** 开屏加载：真实资源进度 + 百分比读数 + 动画元素，禁止静态进度条 */
  bootProgress(ratio, labelKey = "boot.loading") {
    const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
    const fill = document.getElementById("boot-fill");
    const read = document.getElementById("boot-pct");
    const tip = document.getElementById("boot-tip");
    if (fill) fill.style.width = `${pct}%`;
    if (read) read.textContent = `${pct}%`;
    if (tip) tip.textContent = t(labelKey);
  },
  bootDone() { document.getElementById("boot")?.classList.add("is-done"); }
};

export function toast(text) {
  const tEl = el("div", "toast", text);
  root().appendChild(tEl);
  setTimeout(() => tEl.remove(), 1800);
}