@echo off
chcp 65001 >nul
color 0A
title Web Crawler - Proxy Configuration

echo.
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║           WEB CRAWLER - CẤU HÌNH PROXY                        ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

:MENU
echo [1] Chạy với proxy
echo [2] Chạy không dùng proxy
echo [3] Thoát
echo.
set /p choice="Chọn chế độ (1-3): "

if "%choice%"=="1" goto PROXY_CONFIG
if "%choice%"=="2" goto NO_PROXY
if "%choice%"=="3" goto EXIT
goto MENU

:PROXY_CONFIG
cls
echo.
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║                    NHẬP THÔNG TIN PROXY                       ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.
echo Ví dụ: IP: 171.236.178.110, Port: 18809
echo        Username: muaproxy6968bf29eb718
echo        Password: onnpiatgbtj3thst
echo.

set /p PROXY_HOST="Nhập IP proxy: "
set /p PROXY_PORT="Nhập Port: "
set /p PROXY_USER="Nhập Username: "
set /p PROXY_PASS="Nhập Password: "

if "%PROXY_HOST%"=="" (
    echo.
    echo ❌ IP proxy không được để trống!
    timeout /t 3 >nul
    goto PROXY_CONFIG
)

if "%PROXY_PORT%"=="" (
    echo.
    echo ❌ Port không được để trống!
    timeout /t 3 >nul
    goto PROXY_CONFIG
)

echo.
echo ✓ Đã cấu hình proxy: %PROXY_HOST%:%PROXY_PORT%
echo.
goto START_SERVER

:NO_PROXY
cls
echo.
echo ✓ Chạy không sử dụng proxy
set PROXY_HOST=
set PROXY_PORT=
set PROXY_USER=
set PROXY_PASS=
echo.
goto START_SERVER

:START_SERVER
echo.
echo ╔═══════════════════════════════════════════════════════════════╗
echo ║                    ĐANG KHỞI ĐỘNG SERVER...                   ║
echo ╚═══════════════════════════════════════════════════════════════╝
echo.

REM Kiểm tra node_modules
if not exist "node_modules\" (
    echo ⏳ Đang cài đặt dependencies...
    call npm install
    echo.
)

echo ⏳ Đang khởi động server...
echo.
node server.js

if errorlevel 1 (
    echo.
    echo ❌ Lỗi khi chạy server!
    echo.
    pause
    goto MENU
)

:EXIT
echo.
echo Tạm biệt!
timeout /t 2 >nul
exit
