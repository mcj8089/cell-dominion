// src/core/storage.js — 安全本地存储封装。
// 在以下场景 window.localStorage 的访问会直接抛 SecurityError：
//   - 跨域 iframe（第三方嵌入，如上传后嵌在 pipygames.com 之外的页面）
//   - 带 sandbox 但缺 allow-same-origin 的 iframe
//   - 浏览器隐私模式 / 禁用站点数据
// 这些异常若发生在启动链路（读金币/静音偏好/最高关）会直接把启动页打崩。
// 本封装统一兜底：探测失败即降级为内存存储，任何读写都不再抛出。

const mem = new Map();
let backend = "mem"; // "ls" | "mem"

(function probe() {
  try {
    const k = "__cd_storage_probe__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    backend = "ls";
  } catch {
    backend = "mem"; // 跨域 iframe / 隐私模式：localStorage 不可用，走内存
  }
})();

function fallback(key) {
  return mem.has(key) ? mem.get(key) : null;
}

export const store = {
  /** 当前后端：ls=真实本地存储，mem=内存兜底（可用于 UI 提示「进度不会被保存」 */
  get mode() { return backend; },

  getItem(key) {
    if (backend === "ls") {
      try { return window.localStorage.getItem(key); } catch { backend = "mem"; }
    }
    return fallback(key);
  },

  setItem(key, value) {
    const v = String(value);
    if (backend === "ls") {
      try { window.localStorage.setItem(key, v); return; } catch { backend = "mem"; }
    }
    mem.set(key, v);
  },

  removeItem(key) {
    if (backend === "ls") {
      try { window.localStorage.removeItem(key); return; } catch { backend = "mem"; }
    }
    mem.delete(key);
  }
};

export default store;
