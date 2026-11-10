#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《时镜 TimeMirror》· Obsidian 局域网极速直通同步服务 (带 Windows 托盘图标)
- 仿照 WindSend，常驻任务栏右下角向上箭头角标
- 内存占用仅 8~12MB，平时休眠 CPU 0%
- 点击托盘小图标可随时查看状态、打开日志目录或一键退出释放内存
- 支持右键菜单一键勾选/取消【开机自动启动】
"""

import os
import sys
import json
import re
import socket
import threading
import webbrowser
import subprocess
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler

# 依赖库
from PIL import Image
import pystray
from pystray import MenuItem as item, Menu

# 核心配置
VAULT_ROOT = r"D:\cangku\浮生"
DIARY_SUBDIR = r"04_知行生活\身心纪事"
TEMPLATE_PATH = os.path.join(VAULT_ROOT, DIARY_SUBDIR, "_每日终极知行模板.md")
PORT = 28888
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ICON_PATH = os.path.join(BASE_DIR, "icon-192.png")
TIMEMIRROR_WEB_URL = "https://miwumw.github.io/timemirror/"

httpd_server = None

def get_lan_ip():
    """获取本机 Wi-Fi/局域网真实 IP (优先匹配 192.168.x.x)"""
    try:
        ips = socket.gethostbyname_ex(socket.gethostname())[2]
        for ip in ips:
            if ip.startswith("192.168.") or ip.startswith("10.") or ip.startswith("172.16."):
                return ip
        return ips[0] if ips else "127.0.0.1"
    except Exception:
        return "127.0.0.1"

def write_to_obsidian(date_str, formatted_text, records=None):
    """精确写入或更新当天 Obsidian 知行日志的【### ⚡ 暮夜对账】板块"""
    diary_dir = os.path.join(VAULT_ROOT, DIARY_SUBDIR)
    os.makedirs(diary_dir, exist_ok=True)
    target_file = os.path.join(diary_dir, f"{date_str}_每日知行日志.md")

    # 1. 如果文件不存在，从模板自动生成今日日志
    if not os.path.exists(target_file):
        if os.path.exists(TEMPLATE_PATH):
            with open(TEMPLATE_PATH, "r", encoding="utf-8") as tf:
                content = tf.read()
            content = content.replace("{{date}}", date_str)
        else:
            content = f"# 📅 {date_str} 每日知行日志\n\n### 🎯 晨起立志\n- [ ] 1. \n\n### ⚡ 暮夜对账（实际做了什么？）\n\n### 🪞 诚意慎独\n"

        section_pattern = r"(###\s*⚡\s*暮夜对账[^\n]*\n)"
        if re.search(section_pattern, content):
            replacement = r"\1" + formatted_text.strip() + "\n\n"
            content = re.sub(section_pattern, replacement, content, count=1)
        else:
            content += f"\n### ⚡ 暮夜对账（实际做了什么？）\n{formatted_text.strip()}\n"

        with open(target_file, "w", encoding="utf-8") as f:
            f.write(content)
        return True, f"已根据模板新建今日日志并写入：{date_str}_每日知行日志.md"

    # 2. 文件已存在，精确替换对账段落（多次写入绝不重复累加）
    with open(target_file, "r", encoding="utf-8") as f:
        content = f.read()

    pattern = r"(###\s*⚡\s*暮夜对账[^\n]*\n)([\s\S]*?)(?=\n---|###|\Z)"
    match = re.search(pattern, content)

    if match:
        new_section = match.group(1) + formatted_text.strip() + "\n\n"
        content = content[:match.start()] + new_section + content[match.end():]
    else:
        insert_marker = "### 🎯 晨起立志"
        if insert_marker in content:
            pos = content.find(insert_marker)
            next_heading = content.find("###", pos + len(insert_marker))
            if next_heading != -1:
                content = content[:next_heading] + f"### ⚡ 暮夜对账（实际做了什么？）\n{formatted_text.strip()}\n\n" + content[next_heading:]
            else:
                content += f"\n\n### ⚡ 暮夜对账（实际做了什么？）\n{formatted_text.strip()}\n"
        else:
            content += f"\n\n### ⚡ 暮夜对账（实际做了什么？）\n{formatted_text.strip()}\n"

    with open(target_file, "w", encoding="utf-8") as f:
        f.write(content)

    return True, f"已成功刷新 {date_str}_每日知行日志.md 的暮夜对账"

class SyncHandler(BaseHTTPRequestHandler):
    def _send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/status"):
            lan_ip = get_lan_ip()
            today_str = datetime.now().strftime("%Y-%m-%d")
            resp = {
                "status": "online",
                "app": "TimeMirror-Obsidian-Sync-Bridge",
                "version": "1.1.0",
                "vault": VAULT_ROOT,
                "lan_ip": lan_ip,
                "port": PORT,
                "today": today_str,
                "targetDir": os.path.join(VAULT_ROOT, DIARY_SUBDIR)
            }
            body = json.dumps(resp, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self._send_cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            # 静态文件服务 (让手机可直接访问局域网纯内网版时镜，彻底绕过浏览器的 HTTPS Mixed Content 限制)
            clean_path = self.path.split("?")[0].lstrip("/")
            if not clean_path or clean_path == "/":
                clean_path = "index.html"
            file_path = os.path.join(BASE_DIR, clean_path)

            if os.path.exists(file_path) and os.path.isfile(file_path):
                ext = os.path.splitext(file_path)[1].lower()
                mime_types = {
                    ".html": "text/html; charset=utf-8",
                    ".js": "application/javascript; charset=utf-8",
                    ".css": "text/css; charset=utf-8",
                    ".json": "application/json; charset=utf-8",
                    ".png": "image/png",
                    ".jpg": "image/jpeg",
                    ".svg": "image/svg+xml",
                    ".ico": "image/x-icon"
                }
                ctype = mime_types.get(ext, "application/octet-stream")
                with open(file_path, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self._send_cors()
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_response(404)
                self._send_cors()
                self.end_headers()

    def do_POST(self):
        if self.path.startswith("/sync"):
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(post_data)
                date_str = data.get("date") or datetime.now().strftime("%Y-%m-%d")
                formatted_text = data.get("formattedText", "")
                records = data.get("records", [])

                if not formatted_text and records:
                    lines = []
                    for r in records:
                        cat_name = r.get("categoryName") or r.get("category") or "日常"
                        note = r.get("note", "").strip()
                        line = f"- **{r.get('start')} - {r.get('end')}**：【{cat_name}】{note if note else '完成'}"
                        lines.append(line)
                    formatted_text = "\n".join(lines)

                success, msg = write_to_obsidian(date_str, formatted_text, records)
                resp = { "success": success, "message": msg, "date": date_str, "count": len(records) }
                code = 200 if success else 500
            except Exception as e:
                resp = { "success": False, "message": f"处理错误: {str(e)}" }
                code = 500

            body = json.dumps(resp, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self._send_cors()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # 托盘静默运行，无需控制台输出

# 开机自启管理
def get_startup_lnk_path():
    appdata = os.getenv("APPDATA")
    if not appdata:
        return ""
    return os.path.join(appdata, r"Microsoft\Windows\Start Menu\Programs\Startup", "时镜Obsidian同步服务.lnk")

def is_startup_enabled():
    path = get_startup_lnk_path()
    return os.path.exists(path) if path else False

def toggle_startup(icon, item):
    lnk = get_startup_lnk_path()
    if not lnk:
        return
    if is_startup_enabled():
        try:
            os.remove(lnk)
        except Exception:
            pass
    else:
        # 创建 Windows 快捷方式 (调用 pythonw 静默自启)
        py_dir = os.path.dirname(sys.executable)
        pyw = os.path.join(py_dir, "pythonw.exe")
        target_exe = pyw if os.path.exists(pyw) else sys.executable
        script = os.path.abspath(__file__)
        work_dir = os.path.dirname(script)
        cmd = f'$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut("{lnk}"); $s.TargetPath = "{target_exe}"; $s.Arguments = "`"{script}`""; $s.WorkingDirectory = "{work_dir}"; $s.Save()'
        subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True)

# 菜单操作
def on_open_web(icon, item):
    webbrowser.open(TIMEMIRROR_WEB_URL)

def on_open_diary_dir(icon, item):
    diary_dir = os.path.join(VAULT_ROOT, DIARY_SUBDIR)
    if os.path.exists(diary_dir):
        os.startfile(diary_dir)

def on_exit(icon, item):
    icon.stop()
    if httpd_server:
        threading.Thread(target=httpd_server.shutdown).start()
    os._exit(0)

def main():
    global httpd_server
    lan_ip = get_lan_ip()

    # 1. 准备托盘图标 (使用时镜自己的 192x192 图标)
    if os.path.exists(ICON_PATH):
        image = Image.open(ICON_PATH)
    else:
        image = Image.new("RGB", (64, 64), color=(79, 70, 229))

    # 2. 创建托盘菜单
    menu = Menu(
        item(f"🪞 时镜同步服务 (运行中: {lan_ip}:{PORT})", lambda icon, item: None, enabled=False),
        Menu.SEPARATOR,
        item("🌐 打开《时镜》网页 (手机/电脑)", on_open_web),
        item("📂 打开 Obsidian 知行日志目录", on_open_diary_dir),
        item("☑️ 开机自动启动", toggle_startup, checked=lambda item: is_startup_enabled()),
        Menu.SEPARATOR,
        item("❌ 退出并关闭服务 (释放内存)", on_exit)
    )

    # 3. 启动系统托盘 (后台独立消息泵线程)
    icon = pystray.Icon(
        "TimeMirrorSync",
        image,
        f"《时镜》Obsidian 直通服务 (地址: {lan_ip}:{PORT})",
        menu
    )
    icon.run_detached()

    # 4. 主线程启动 HTTP 服务监听并阻塞运行
    server_address = ("0.0.0.0", PORT)
    httpd_server = HTTPServer(server_address, SyncHandler)
    httpd_server.serve_forever()

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        with open(r"D:\fzl\fs\timemirror\tray_debug.log", "w", encoding="utf-8") as f:
            traceback.print_exc(file=f)
