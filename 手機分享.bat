@echo off
chcp 65001 >nul
title 策定九州試算器 - 手機分享模式
cd /d "%~dp0"

REM --- 防火牆放行 7100（需要管理員，失敗則提示）---
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [提示] 首次使用建議以管理員身分執行，才能自動放行防火牆。
    echo.
) else (
    netsh advfirewall firewall add rule name="九州試算器 7100" dir=in action=allow protocol=TCP localport=7100 >nul 2>&1
    echo [OK] 防火牆已放行 port 7100
)

echo ============================================
echo   策定九州 隊伍傷害試算器 - 手機分享模式
echo ============================================
echo.
echo   本機開啟：  http://localhost:7100
echo   手機開啟：  http://10.0.10.196:7100
echo   （手機必須和這台電腦連同一個 Wi-Fi）
echo.
echo   關閉此視窗即停止分享。
echo ============================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [錯誤] 找不到 node，請先安裝 Node.js 或聯繫管理員。
    pause
    exit /b 1
)

node server.js --host 0.0.0.0 --port 7100
pause
