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

def write_to_obsidian(date_str, formatted_text, records=None, plan_text=None, reflection_text=None, weight=None, habits=None, body_state=None):
    """
    精确写入或更新当天 Obsidian 知行日志的核心元素：
    1. 【### 🎯 晨起立志（打算做什么？）】—— 今日计划
    2. 【### ⚡ 暮夜对账（实际做了什么？）】—— 时间执行流水
    3. 【### 🪞 诚意慎独（今日得失与明日调适）】—— 今日反思
    4. 【晨起体重】—— Frontmatter weight 与 正文晨起体重记录
    5. 【第二部分 · 每日践行微步】—— 🟢保底线与🟡进阶项打卡勾选
    6. 【第三部分 · 身体与心绪追踪】—— 晨起精力、鼻腔通气、体态自觉、情绪应激、平复时差
    """
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
            content = (
                f"---\ndate: \"{date_str}\"\ntags:\n  - 知行日志\n---\n\n"
                f"# 📅 {date_str} 每日知行与身心修持日志\n\n"
                f"### 🎯 晨起立志（打算做什么？）\n- [ ] 1. \n\n"
                f"### ⚡ 暮夜对账（实际做了什么？）\n\n"
                f"### 🪞 诚意慎独（今日得失与明日调适）\n\n"
            )
    else:
        with open(target_file, "r", encoding="utf-8") as f:
            content = f.read()

    # 2. 更新或写入【体重 (Weight)】
    if weight is not None and str(weight).strip() != "":
        w_val = str(weight).strip()
        # 更新 YAML Frontmatter
        fm_match = re.search(r"^---\n([\s\S]*?)\n---", content)
        if fm_match:
            fm_text = fm_match.group(1)
            if re.search(r"^weight:.*$", fm_text, re.MULTILINE):
                new_fm = re.sub(r"^weight:.*$", f"weight: {w_val}", fm_text, flags=re.MULTILINE)
            else:
                new_fm = fm_text.rstrip() + f"\nweight: {w_val}\n"
            content = f"---\n{new_fm.strip()}\n---" + content[fm_match.end():]

        # 更新或插入第三部分的晨起体重
        if re.search(r"- \*\*(?:空腹/)?晨起体重\*\*：.*", content):
            content = re.sub(r"- \*\*(?:空腹/)?晨起体重\*\*：.*", f"- **空腹/晨起体重**：{w_val} kg", content)
        elif "- **晨起体重**：" in content:
            content = re.sub(r"- \*\*晨起体重\*\*：.*", f"- **晨起体重**：{w_val} kg", content)
        elif "### 1. 身体状态与晨起体感" in content:
            content = content.replace("### 1. 身体状态与晨起体感\n", f"### 1. 身体状态与晨起体感\n- **空腹/晨起体重**：{w_val} kg\n")
        elif "### 1. 晨起体感与起居" in content:
            content = content.replace("### 1. 晨起体感与起居\n", f"### 1. 晨起体感与起居\n- **晨起体重**：{w_val} kg\n")

    # 3. 更新或写入【今日计划（### 🎯 晨起立志）】
    if plan_text is not None and plan_text.strip():
        plan_lines = [l.strip() for l in plan_text.strip().split("\n") if l.strip()]
        formatted_plans = []
        for i, l in enumerate(plan_lines, 1):
            clean_l = re.sub(r"^(?:-\s*\[[ x]\]\s*)?(?:\d+[\.\、]\s*)?", "", l).strip()
            formatted_plans.append(f"- [ ] {i}. {clean_l}")
        plan_block = "\n".join(formatted_plans)

        pattern_plan = r"(###\s*🎯\s*晨起立志[^\n]*\n)([\s\S]*?)(?=\n###|\n---|\Z)"
        match_plan = re.search(pattern_plan, content)
        if match_plan:
            orig_body = match_plan.group(2)
            quote = ""
            if "> 顺应今日身心气能" in orig_body:
                quote = "> 顺应今日身心气能，参考 [[学习项目四阶追踪表]]，每日核心要务不超过 3 件：\n"
            new_section = match_plan.group(1) + quote + plan_block + "\n\n"
            content = content[:match_plan.start()] + new_section + content[match_plan.end():]
        else:
            insert_marker = "# 🎯 第一部分"
            if insert_marker in content:
                pos = content.find(insert_marker)
                nl = content.find("\n", pos)
                content = content[:nl+1] + f"\n### 🎯 晨起立志（打算做什么？）\n{plan_block}\n\n" + content[nl+1:]
            else:
                content += f"\n\n### 🎯 晨起立志（打算做什么？）\n{plan_block}\n"

    # 4. 更新或写入【暮夜对账（### ⚡ 暮夜对账）】
    if formatted_text is not None and formatted_text.strip():
        pattern_exec = r"(###\s*⚡\s*暮夜对账[^\n]*\n)([\s\S]*?)(?=\n###|\n---|\Z)"
        match_exec = re.search(pattern_exec, content)
        if match_exec:
            new_section = match_exec.group(1) + formatted_text.strip() + "\n\n"
            content = content[:match_exec.start()] + new_section + content[match_exec.end():]
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

    # 5. 更新或写入【今日反思（### 🪞 诚意慎独）】
    if reflection_text is not None and reflection_text.strip():
        refl_lines = [l.strip() for l in reflection_text.strip().split("\n") if l.strip()]
        formatted_refl = []
        for l in refl_lines:
            if not l.startswith("-"):
                formatted_refl.append(f"- {l}")
            else:
                formatted_refl.append(l)
        refl_block = "\n".join(formatted_refl)

        pattern_refl = r"(###\s*🪞\s*诚意慎独[^\n]*\n)([\s\S]*?)(?=\n###|\n---|\Z)"
        match_refl = re.search(pattern_refl, content)
        if match_refl:
            new_section = match_refl.group(1) + refl_block + "\n\n"
            content = content[:match_refl.start()] + new_section + content[match_refl.end():]
        else:
            content += f"\n\n### 🪞 诚意慎独（今日得失与明日调适）\n{refl_block}\n"

    # 6. 更新或勾选【践行微步（分级打卡）】
    if habits and isinstance(habits, dict):
        habit_patterns = {
            "meditation": r"(-\s*\[[ x]\]\s*)(\s*晨起调息/冥想[^\n]*)",
            "baduanjin": r"(-\s*\[[ x]\]\s*)(\s*八段锦\s*1\s*遍[^\n]*)",
            "posture3": r"(-\s*\[[ x]\]\s*)(\s*体态调整\s*3\s*动作[^\n]*)",
            "yijinjing": r"(-\s*\[[ x]\]\s*)(\s*易筋经\s*/\s*五脏逼毒[^\n]*)",
            "mabu": r"(-\s*\[[ x]\]\s*)(\s*四平马步[^\n]*)",
            "sleepMeditation": r"(-\s*\[[ x]\]\s*)(\s*睡前冥想[^\n]*)",
            "calisthenics": r"(-\s*\[[ x]\]\s*)(\s*囚徒健身[^\n]*)"
        }
        for h_key, pat in habit_patterns.items():
            if h_key in habits:
                mark = "[x]" if habits[h_key] else "[ ]"
                content = re.sub(pat, f"- {mark} \\2", content)

    # 7. 更新【身体与心绪追踪】
    if body_state and isinstance(body_state, dict):
        # 晨起精力 (1~5)
        energy_val = body_state.get("energy")
        if energy_val:
            content = re.sub(
                r"- \*\*晨起精力\*\*：.*",
                f"- **晨起精力**：{energy_val} / 5 分（1分沉重疲惫，3分平稳，5分清爽通透）",
                content
            )

        # 鼻腔通气
        nose_val = body_state.get("nose")
        if nose_val:
            opts = ["左通右阻", "右通左阻", "均通畅", "均发堵"]
            nose_boxes = " ".join([f"[{'x' if opt == nose_val else ' '}] {opt}" for opt in opts])
            content = re.sub(r"- \*\*鼻腔通气\*\*：.*", f"- **鼻腔通气**：{nose_boxes}", content)

        # 体态自觉 (1~5)
        posture_val = body_state.get("postureScore")
        if posture_val:
            content = re.sub(
                r"- \*\*体态自觉\*\*：.*",
                f"- **体态自觉**：{posture_val} / 5 分（脊柱挺拔、胸背自然舒展度）",
                content
            )

        # 情绪应激
        stress_val = body_state.get("stress")
        if stress_val:
            s_opts = ["无明显波澜", "遇事发紧/心慌", "陷入焦虑退缩"]
            stress_boxes = " ".join([f"[{'x' if opt == stress_val else ' '}] {opt}" for opt in s_opts])
            content = re.sub(r"- \*\*今日应激\*\*：.*", f"- **今日应激**：{stress_boxes}", content)

        # 平复时差
        recover_val = body_state.get("recoverMinutes")
        if recover_val is not None and str(recover_val).strip() != "":
            content = re.sub(
                r"- \*\*平复时差\*\*：.*",
                f"- **平复时差**：{recover_val} 分钟（觉察并深呼吸/冥想后回神的速度）",
                content
            )

        # 整日身心状态与症状
        symptom_notes = body_state.get("bodySymptomNotes") or body_state.get("symptomNotes") or body_state.get("symptoms") or ""
        if symptom_notes and str(symptom_notes).strip():
            clean_symp = str(symptom_notes).strip()
            p_symp = r"(- \*\*整日身心状态与症状\*\*[:：])([\s\S]*?)(?=\n###|\n---|\Z)"
            if re.search(p_symp, content):
                content = re.sub(p_symp, lambda m: f"{m.group(1)} {clean_symp}\n\n", content, count=1)
            elif "### 1. 身体状态与晨起体感" in content:
                content = content.replace("### 1. 身体状态与晨起体感\n", f"### 1. 身体状态与晨起体感\n- **整日身心状态与症状**： {clean_symp}\n")

        # 情绪耐受度具体过程
        stress_notes = body_state.get("stressDetailNotes") or body_state.get("stressNotes") or body_state.get("stressDetail") or ""
        if stress_notes and str(stress_notes).strip():
            clean_stress = str(stress_notes).strip()
            p_stress = r"(- \*\*具体过程\*\*[:：])([\s\S]*?)(?=\n###|\n---|\Z)"
            if re.search(p_stress, content):
                content = re.sub(p_stress, lambda m: f"{m.group(1)} {clean_stress}\n\n", content, count=1)
            elif "### 2. 情绪耐受度" in content:
                content = content.replace("### 2. 情绪耐受度\n", f"### 2. 情绪耐受度\n- **具体过程**： {clean_stress}\n")

    with open(target_file, "w", encoding="utf-8") as f:
        f.write(content)

    return True, f"已成功更新 {date_str}_每日知行日志.md 的计划、执行、反思、微步打卡与身心数据！"

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
                "version": "1.3.0",
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
            ctype = self.headers.get("Content-Type", "")
            is_form = "application/x-www-form-urlencoded" in ctype
            try:
                if is_form:
                    import urllib.parse
                    params = urllib.parse.parse_qs(post_data)
                    json_str = params.get("payload", ["{}"])[0]
                    data = json.loads(json_str)
                else:
                    data = json.loads(post_data)

                date_str = data.get("date") or datetime.now().strftime("%Y-%m-%d")
                formatted_text = data.get("formattedText", "")
                records = data.get("records", [])
                plan_text = data.get("planText", "")
                reflection_text = data.get("reflectionText", "")
                weight = data.get("weight", None)
                habits = data.get("habits", None)
                body_state = data.get("bodyState", None)

                # 记录请求排查日志
                try:
                    log_file = os.path.join(BASE_DIR, "sync_server.log")
                    with open(log_file, "a", encoding="utf-8") as lf:
                        lf.write(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] /sync date={date_str} is_form={is_form}\n")
                        if body_state:
                            lf.write(f"  bodyState: {json.dumps(body_state, ensure_ascii=False)}\n")
                except Exception:
                    pass

                if not formatted_text and records:
                    lines = []
                    for r in records:
                        cat_name = r.get("categoryName") or r.get("category") or "日常"
                        note = r.get("note", "").strip()
                        line = f"- **{r.get('start')} - {r.get('end')}**：【{cat_name}】{note if note else '完成'}"
                        lines.append(line)
                    formatted_text = "\n".join(lines)

                success, msg = write_to_obsidian(
                    date_str, 
                    formatted_text, 
                    records=records, 
                    plan_text=plan_text, 
                    reflection_text=reflection_text, 
                    weight=weight,
                    habits=habits,
                    body_state=body_state
                )
                code = 200 if success else 500

                if is_form:
                    # 表单跨域穿透成功后的 HTML 响应 (通知父窗口 iframe)
                    html = f'<!DOCTYPE html><html><body><script>try{{window.parent.postMessage({{"status":"ok","msg":"{msg}"}}, "*");}}catch(e){{}}</script></body></html>'.encode("utf-8")
                    self.send_response(code)
                    self._send_cors()
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(html)))
                    self.end_headers()
                    self.wfile.write(html)
                    return

                resp = { "success": success, "message": msg, "date": date_str, "count": len(records) }
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
