#!/usr/bin/env python3
"""一键启动用的本地预览服务（仅 Python 标准库）。

相比 python -m http.server 做了三件事：
1. 使用 18000~18050 独立端口段，避开本机已被其它项目占用的
   8000/8001/8100/8123~8125 等常见端口（旧 origin 上可能还残留 Service Worker / HTTP 缓存）；
2. 强制 no-store 响应头，避免浏览器缓存旧脚本 / 旧 Service Worker 导致停在加载页；
3. 服务真正监听成功后才打开浏览器，消除打开页面时服务尚未就绪的竞态。

服务目录恒为本文件所在目录，因此根目录与 dist/web/ 都能各自独立启动。
"""
from __future__ import annotations

import functools
import http.server
import os
import socket
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT_RANGE = range(18000, 18051)
BUILD = "20261112-4"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """静态文件 + 禁缓存头。"""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # 允许被其它源的页面以 iframe 嵌入（上传后常跨域嵌套）；
        # 同时让沙箱 iframe（opaque origin）也能加载 ES 模块
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        # 逐帧 PNG / 音频请求很多，日志只保留错误，控制台保持干净
        if args and str(args[1] if len(args) > 1 else "").startswith(("4", "5")):
            super().log_message(fmt, *args)


def find_free_port() -> int:
    """用 bind 实测，比 netstat 文本匹配可靠（TIME_WAIT 不会被误判为占用）。"""
    for port in PORT_RANGE:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("18000~18050 端口全部被占用，请先关闭其它本地服务")


def main() -> int:
    port = find_free_port()
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    url = f"http://localhost:{port}/?v={BUILD}"   # 带版本号，进一步绕开浏览器 HTTP 缓存
    print("[Cell Dominion] 本地预览已启动：" + url)
    print("[Cell Dominion] 版本：" + BUILD)
    print("[Cell Dominion] 服务目录：" + str(ROOT))
    print("[Cell Dominion] 请关闭旧的 localhost 标签页，只用上面这个新地址访问")
    print("[Cell Dominion] 关闭本窗口即可停止服务")
    # 服务已监听，延迟极短时间再开浏览器，确保首次请求不会撞上未就绪窗口
    # CELL_NO_BROWSER=1 供自动化验收使用，不弹浏览器
    if not os.environ.get("CELL_NO_BROWSER"):
        threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[Cell Dominion] 已停止")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
