@echo off
chcp 65001 >nul
title 时镜 Obsidian 同步服务
cd /d "%~dp0"
echo 正在启动《时镜》Obsidian 局域网直通同步服务...
python obsidian_sync_server.py
pause
