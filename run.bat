@echo off
chcp 65001 >nul
color 0A
title Web Crawler - Proxy Configuration

echo.
echo           WEB CRAWLER - CAU HINH PROXY
echo.

:MENU
echo [1] Chay voi proxy
echo [2] Chay khong dung proxy
echo [3] Thoat
echo.
set /p choice="Chon che do (1-3): "

if "%choice%"=="1" goto PROXY_CONFIG
if "%choice%"=="2" goto NO_PROXY
if "%choice%"=="3" goto EXIT
goto MENU

:PROXY_CONFIG
cls
echo.
echo                    NHAP THONG TIN PROXY
echo.
echo Vi du: IP: 171.236.178.110, Port: 18809
echo        Username: muaproxy6968bf29eb718
echo        Password: onnpiatgbtj3thst
echo.
echo Nhap "q" de quay lai menu chinh
echo.

set /p PROXY_HOST="Nhap IP proxy: "
if /i "%PROXY_HOST%"=="q" goto MENU

set /p PROXY_PORT="Nhap Port: "
if /i "%PROXY_PORT%"=="q" goto MENU

set /p PROXY_USER="Nhap Username: "
if /i "%PROXY_USER%"=="q" goto MENU

set /p PROXY_PASS="Nhap Password: "
if /i "%PROXY_PASS%"=="q" goto MENU

if "%PROXY_HOST%"=="" (
    echo.
    echo [X] IP proxy khong duoc de trong!
    timeout /t 3 >nul
    goto PROXY_CONFIG
)

if "%PROXY_PORT%"=="" (
    echo.
    echo [X] Port khong duoc de trong!
    timeout /t 3 >nul
    goto PROXY_CONFIG
)

echo.
echo [OK] Da cau hinh proxy: %PROXY_HOST%:%PROXY_PORT%
echo.
echo [1] Xac nhan va chay
echo [2] Nhap lai
echo.
set /p confirm="Lua chon (1-2): "

if "%confirm%"=="2" goto PROXY_CONFIG
if "%confirm%"=="1" goto START_SERVER

goto START_SERVER

:NO_PROXY
cls
echo.
echo [OK] Chay khong su dung proxy
set PROXY_HOST=
set PROXY_PORT=
set PROXY_USER=
set PROXY_PASS=
echo.
goto START_SERVER

:START_SERVER
echo.
echo DANG KHOI DONG SERVER...
echo.

REM Kiem tra node_modules
if not exist "node_modules\" (
    echo [*] Dang cai dat dependencies...
    call yarn install
    echo.
)

echo [*] Dang khoi dong server...
echo.
node server.js

if errorlevel 1 (
    echo.
    echo [X] Loi khi chay server!
    echo.
    pause
    goto MENU
)

:EXIT
echo.
echo Tam biet!
timeout /t 2 >nul
exit
