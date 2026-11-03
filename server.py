import http.server
import socketserver
import socket
import sys
import os

# Set standard output to UTF-8
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

PORT = 8080

def get_lan_ips():
    ips = []
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127.") and not ip.startswith("169.254."):
                ips.append(ip)
    except Exception:
        pass
    
    # Priority for 192.168.*
    ips.sort(key=lambda x: (not x.startswith("192.168."), not x.startswith("10."), not x.startswith("172.")))
    return ips if ips else ["127.0.0.1"]

class CustomHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    lan_ips = get_lan_ips()
    primary_ip = lan_ips[0]

    global PORT
    httpd = None
    for p in range(8080, 8095):
        try:
            httpd = socketserver.TCPServer(("0.0.0.0", p), CustomHTTPHandler)
            PORT = p
            break
        except OSError:
            continue

    if not httpd:
        print("[Error] Could not bind port.")
        sys.exit(1)

    print("=" * 60)
    print("  时镜 TimeMirror 服务已启动！")
    print(f"  电脑本地访问: http://localhost:{PORT}")
    for ip in lan_ips:
        print(f"  手机/局域网访问: http://{ip}:{PORT}")
    print("=" * 60)
    print("使用步骤：")
    print(f"1. 电脑端：直接在浏览器打开 http://localhost:{PORT}")
    print(f"2. 手机端：手机连接同一 Wi-Fi，打开 http://{primary_ip}:{PORT}")
    print("3. 在手机浏览器菜单中选择【添加到主屏幕】，即可全屏体验，如同原生App！")
    print("=" * 60)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止。")

if __name__ == "__main__":
    main()
