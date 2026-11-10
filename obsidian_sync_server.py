#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
时镜 · Obsidian 局域网极速直通同步服务 (TimeMirror Obsidian Sync Bridge)
极轻量后台服务：内存占用 < 10MB，平时 CPU 为 0%，接收手机打卡数据并秒级自动写入每日知行日志。
"""

import os
import sys
import json
import re
import socket
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler

# 默认配置
VAULT_ROOT = r"D:\cangku\浮生"
DIARY_SUBDIR = r"04_知行生活\身心纪事"
TEMPLATE_PATH = os.path.join(VAULT_ROOT, DIARY_SUBDIR, "_每日终极知行模板.md")
PORT = 28888

def get_lan_ip():
    """获取本机 Wi-Fi/局域网真实 IP (优先匹配 192.168.x.x)"""
    try:
        ips = socket.gethostbyname_ex(socket.gethostname())[2]
        # 优先选取标准的局域网私网 IP
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

        # 插入对账内容
        section_pattern = r"(###\s*⚡\s*暮夜对账[^\n]*\n)"
        if re.search(section_pattern, content):
            replacement = r"\1" + formatted_text.strip() + "\n\n"
            content = re.sub(section_pattern, replacement, content, count=1)
        else:
            content += f"\n### ⚡ 暮夜对账（实际做了什么？）\n{formatted_text.strip()}\n"

        with open(target_file, "w", encoding="utf-8") as f:
            f.write(content)
        return True, f"已根据模板新建今日日志并写入：{date_str}_每日知行日志.md"

    # 2. 文件已存在，精确替换或更新对账段落
    with open(target_file, "r", encoding="utf-8") as f:
        content = f.read()

    # 匹配从 ### ⚡ 暮夜对账 开始，直到下一个 --- 或 ### 标题之间的区域
    pattern = r"(###\s*⚡\s*暮夜对账[^\n]*\n)([\s\S]*?)(?=\n---|###|\Z)"
    match = re.search(pattern, content)

    if match:
        new_section = match.group(1) + formatted_text.strip() + "\n"
        content = content[:match.start()] + new_section + content[match.end():]
    else:
        # 找不到对应标题，插入到第一部分之后
        insert_marker = "### 🎯 晨起立志"
        if insert_marker in content:
            pos = content.find(insert_marker)
            # 找到晨起立志下一段
            next_heading = content.find("###", pos + len(insert_marker))
            if next_heading != -1:
                content = content[:next_heading] + f"### ⚡ 暮夜对账（实际做了什么？）\n{formatted_text.strip()}\n\n" + content[next_heading:]
            else:
                content += f"\n\n### ⚡ 暮夜对账（实际做了什么？）\n{formatted_text.strip()}\n"
        else:
            content += f"\n\n### ⚡ 暮夜对账（实际做了什么？）\n{formatted_text.strip()}\n"

    with open(target_file, "w", encoding="utf-8") as f:
        f.write(content)

    return True, f"已成功更新 {date_str}_每日知行日志.md 的暮夜对账内容"

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
        if self.path.startswith("/status") or self.path == "/":
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
            self.send_response(404)
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
                    # 备用：从 records 自动组装
                    lines = []
                    for r in records:
                        cat_name = r.get("categoryName") or r.get("category") or "日常"
                        note = r.get("note", "").strip()
                        line = f"- **{r.get('start')} - {r.get('end')}**：【{cat_name}】{note if note else '已完成'}"
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
        # 仅输出关键提示，不产生刷屏噪音
        sys.stdout.write(f"[{datetime.now().strftime('%H:%M:%S')}] {args[0]}\n")

def run():
    ip = get_lan_ip()
    print("=" * 60)
    print("✨ 《时镜》· Obsidian 局域网极速直通同步服务已启动")
    print(f"📡 局域网直通地址: http://{ip}:{PORT}")
    print(f"📂 关联 Obsidian 仓库: {VAULT_ROOT}")
    print(f"📝 目标知行日志路径: {os.path.join(VAULT_ROOT, DIARY_SUBDIR)}")
    print("💡 手机连接同一 Wi-Fi 时，可在《时镜》中一键秒级写入当天的【暮夜对账】！")
    print("=" * 60)
    server_address = ("0.0.0.0", PORT)
    httpd = HTTPServer(server_address, SyncHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已平稳关闭。")

if __name__ == "__main__":
    run()
