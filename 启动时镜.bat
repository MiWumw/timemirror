@echo off
chcp 65001 >nul
title 时镜 TimeMirror
cd /d "%~dp0"
start http://localhost:8080
python server.py
pause
